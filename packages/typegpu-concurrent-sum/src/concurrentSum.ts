import type {
  StorageFlag,
  TgpuBuffer,
  TgpuFn,
  TgpuQuerySet,
  TgpuRoot,
} from 'typegpu';
import type * as d from 'typegpu/data';
import {
  identitySlot,
  maxDispatchSize,
  operatorSlot,
  upSweepLayout,
  workgroupSize,
} from './schemas.ts';
import { incrementShader } from './compute/incrementShader.ts';
import { computeUpPass } from './compute/computeUpPass.ts';
import { ConcurrentSumCache } from './compute/cache.ts';

export async function currentSum(
  root: TgpuRoot,
  inputBuffer: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag,
  operatorFn: (x: number, y: number) => number,
  identity: number,
  outputBuffer?: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag,
  timeCallback?: (timeTgpuQuery: TgpuQuerySet<'timestamp'>) => void,
) {
  let depthCount = 0;
  // Pipelines
  const querySet = root.createQuerySet('timestamp', 2);
  const upPassPipeline = root['~unstable']
    .with(operatorSlot, operatorFn as unknown as TgpuFn)
    .withCompute(computeUpPass)
    .createPipeline()
    .$name('UpScan');

  const upPassPipelineWithTimestamp = upPassPipeline
    .withTimestampWrites({
      querySet,
      beginningOfPassWriteIndex: 0,
    });

  const applySumsPipeline = root['~unstable']
    .with(operatorSlot, operatorFn as unknown as TgpuFn)
    .withCompute(incrementShader)
    .createPipeline()
    .$name('applySums');

  const applySumsPipelineWithTimestamp = applySumsPipeline
    .withTimestampWrites({
      querySet: querySet,
      endOfPassWriteIndex: 1,
    })
    .$name('applySums');

  const n = inputBuffer.dataType.elementCount;
  const cache: ConcurrentSumCache = new ConcurrentSumCache(root, n);

  function recursiveScan(
    n: number,
    inputBuffer: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag,
  ): TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag {
    const itemsPerWorkgroup = workgroupSize * 2;
    depthCount++;

    // Up-pass
    const outputBuffer = cache.pop();
    const upPassSumsBuffer = cache.pop();
    const upPassBindGroup = root.createBindGroup(upSweepLayout, {
      inputArray: inputBuffer,
      outputArray: outputBuffer,
      sumsArray: upPassSumsBuffer,
    });

    const upSweepWorkgroups = {
      xGroups: Math.min(Math.ceil(n / itemsPerWorkgroup), maxDispatchSize),
      yGroups: Math.min(
        Math.ceil(Math.ceil(n / itemsPerWorkgroup) / maxDispatchSize),
        maxDispatchSize,
      ),
      zGroups: Math.ceil(
        Math.ceil(n / itemsPerWorkgroup) / (maxDispatchSize * maxDispatchSize),
      ),
    };

    depthCount === 1
      ? upPassPipelineWithTimestamp
        .with(upSweepLayout, upPassBindGroup)
        .dispatchWorkgroups(
          upSweepWorkgroups.xGroups,
          upSweepWorkgroups.yGroups,
          upSweepWorkgroups.zGroups,
        )
      : upPassPipeline
        .with(upSweepLayout, upPassBindGroup)
        .dispatchWorkgroups(
          upSweepWorkgroups.xGroups,
          upSweepWorkgroups.yGroups,
          upSweepWorkgroups.zGroups,
        );

    root['~unstable'].flush();
    cache.push(inputBuffer);

    // Recursive phase
    let sumsScannedBuffer: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag;
    if (n <= itemsPerWorkgroup) {
      sumsScannedBuffer = upPassSumsBuffer;
    } else {
      sumsScannedBuffer = recursiveScan(
        Math.ceil(n / itemsPerWorkgroup),
        upPassSumsBuffer,
      );
    }
    cache.push(upPassSumsBuffer);

    if (n <= itemsPerWorkgroup) {
      // if the array is small enough the final tree level does not need to apply the sums
      return outputBuffer;
    }

    // Apply sums
    const finalOutputBuffer = cache.pop();
    const applySumsBindGroup = root.createBindGroup(upSweepLayout, {
      inputArray: outputBuffer,
      outputArray: finalOutputBuffer,
      sumsArray: sumsScannedBuffer,
    });

    const applyWorkgroups = {
      XGroups: Math.min(Math.ceil(n / workgroupSize), maxDispatchSize),
      YGroups: Math.min(
        Math.ceil(Math.ceil(n / workgroupSize) / maxDispatchSize),
        maxDispatchSize,
      ),
      ZGroups: Math.ceil(
        Math.ceil(n / workgroupSize) / (maxDispatchSize * maxDispatchSize),
      ),
    };

    applySumsPipelineWithTimestamp
      .with(upSweepLayout, applySumsBindGroup)
      .dispatchWorkgroups(
        applyWorkgroups.XGroups,
        applyWorkgroups.YGroups,
        applyWorkgroups.ZGroups,
      );

    root['~unstable'].flush();
    cache.push(outputBuffer);
    cache.push(sumsScannedBuffer);
    // console.log(
    // finalOutputBuffer.read().then((arr) => { //remove
    // console.log('Final output buffer Buffer:', arr); //remove
    // }),
    // );
    return finalOutputBuffer;
  }

  const result = recursiveScan(n, inputBuffer);
  if (timeCallback) {
    querySet.resolve();
    timeCallback(querySet);
  }
  return result;
}
