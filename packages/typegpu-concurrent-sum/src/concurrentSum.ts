import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import type * as d from 'typegpu/data';
import {
  downSweepLayout,
  maxDispatchSize,
  upSweepLayout,
  workgroupSize,
} from './schemas.ts';
import { incrementShader } from './compute/incrementShader.ts';
import { computeUpPass } from './compute/computeUpPass.ts';
import { computeDownPass } from './compute/computeDownPass.ts';
import { ConcurrentSumCache } from './compute/cacheOld.ts';
import type { TgpuQuerySet } from '../../typegpu/src/core/querySet/querySet.ts';

// Time measurement callback type
export type TimeCallback = (timeTgpuQuery: TgpuQuerySet<'timestamp'>) => void;

export async function currentSum(
  root: TgpuRoot,
  inputBuffer: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag,
  outputBufferOpt?: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag,
  timeCallback?: TimeCallback,
) {
  let depthCount = 0;
  // Pipelines
  const querySet = root.createQuerySet('timestamp', 2);
  const upPassPipeline = root['~unstable']
    .withCompute(computeUpPass)
    .createPipeline()
    .$name('UpScan');

  const upPassPipelineWithTimestamp = upPassPipeline
    .withTimestampWrites({
      querySet,
      beginningOfPassWriteIndex: 0, // Write start time at index 0
    });

  const downPassPipeline = root['~unstable']
    .withCompute(computeDownPass)
    .createPipeline()
    .$name('DownScan');

  const applySumsPipeline = root['~unstable']
    .withCompute(incrementShader)
    .createPipeline()
    .$name('applySums');

  const applySumsPipelineWithTimestamp = applySumsPipeline
    .withTimestampWrites({
      querySet: querySet,
      endOfPassWriteIndex: 1, // Write end time at index 1
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
    // console.log(`Recursion depth: ${depthCount}, elementsCount: ${n}`); //remove

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

    if (depthCount === 1) {
      console.log('sd');
      upPassPipelineWithTimestamp
        .with(upSweepLayout, upPassBindGroup)
        .dispatchWorkgroups(
          upSweepWorkgroups.xGroups,
          upSweepWorkgroups.yGroups,
          upSweepWorkgroups.zGroups,
        );
    } else {
      upPassPipeline
        .with(upSweepLayout, upPassBindGroup)
        .dispatchWorkgroups(
          upSweepWorkgroups.xGroups,
          upSweepWorkgroups.yGroups,
          upSweepWorkgroups.zGroups,
        );
    }

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

    // Down-pass
    const downSweepOutputBuffer = cache.pop();
    const downPassBindGroup = root.createBindGroup(downSweepLayout, {
      inputArray: outputBuffer, // output from up-sweep is input for down-sweep
      outputArray: downSweepOutputBuffer,
    });

    downPassPipeline
      .with(downSweepLayout, downPassBindGroup)
      .dispatchWorkgroups(
        upSweepWorkgroups.xGroups,
        upSweepWorkgroups.yGroups,
        upSweepWorkgroups.zGroups,
      );
    root['~unstable'].flush();
    cache.push(outputBuffer);

    if (n <= itemsPerWorkgroup) {
      // if the array is small enough the final tree level does not need to apply the sums
      return downSweepOutputBuffer;
    }

    // Apply sums
    const finalOutputBuffer = cache.pop();
    const applySumsBindGroup = root.createBindGroup(upSweepLayout, {
      inputArray: downSweepOutputBuffer,
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
    cache.push(downSweepOutputBuffer);
    cache.push(sumsScannedBuffer);
    // console.log(finalOutputBuffer.read().then((arr) => { //remove
    // console.log('Final output buffer Buffer:', arr); //remove
    // }));
    return finalOutputBuffer;
  }

  const result = recursiveScan(n, inputBuffer);
  if (timeCallback) {
    querySet.resolve();
    timeCallback(querySet);
  }
  return result;
}
//
