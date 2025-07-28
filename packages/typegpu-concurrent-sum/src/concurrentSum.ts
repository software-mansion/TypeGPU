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
import { ConcurrentSumCache } from './compute/cache.ts';

export async function currentSum(
  root: TgpuRoot,
  inputBuffer: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag,
  outputBufferOpt?: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag,
) {
  let depthCount = 0;
  // Pipelines
  const upPassPipeline = root['~unstable']
    .withCompute(computeUpPass)
    .createPipeline()
    .$name('UpScan');

  const downPassPipeline = root['~unstable']
    .withCompute(computeDownPass)
    .createPipeline()
    .$name('DownScan');

  const applySumsPipeline = root['~unstable']
    .withCompute(incrementShader)
    .createPipeline()
    .$name('applySums');

  const n = inputBuffer.dataType.elementCount;
  const cache: ConcurrentSumCache = new ConcurrentSumCache(root, n);

  function recursiveScan(
    n: number,
    inputBuffer: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag,
  ): TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag {
    const itemsPerWorkgroup = workgroupSize * 2;
    depthCount++; //remove
    console.log(`Recursion depth: ${depthCount}, elementsCount: ${n}`); //remove

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

    upPassPipeline
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
      XGroups: Math.min(
        Math.ceil(n / workgroupSize),
        maxDispatchSize,
      ),
      YGroups: Math.min(
        Math.ceil(Math.ceil(n / workgroupSize) / maxDispatchSize),
        maxDispatchSize,
      ),
      ZGroups: Math.ceil(
        Math.ceil(n / workgroupSize) / (maxDispatchSize * maxDispatchSize),
      ),
    };

    applySumsPipeline
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

  return recursiveScan(n, inputBuffer);
}
