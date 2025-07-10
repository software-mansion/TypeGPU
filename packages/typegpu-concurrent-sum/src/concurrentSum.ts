import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';

import {
  downSweepLayout,
  maxDispatchSize,
  // itemsPerThread,
  upSweepLayout,
  workgroupSize,
} from './schemas.ts';
import { incrementShader } from './compute/incrementShader.ts';
import { computeUpPass } from './compute/computeUpPass.ts';
import { computeDownPass } from './compute/computeDownPass.ts';

export async function currentSum(
  root: TgpuRoot,
  inputBuffer: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag,
  outputBufferOpt?: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag,
) {
  const printBuffer = root.createBuffer(
    d.arrayOf(d.u32, inputBuffer.dataType.elementCount),
  ).$usage('storage');
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

  function recursiveScan(
    inputBuffer: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag,
  ): TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag {
    const n = inputBuffer.dataType.elementCount;
    const itemsPerWorkgroup = workgroupSize * 2;

    depthCount++;
    console.log(`Recursion depth: ${depthCount}, elementsCount: ${n}`);
    // Create output buffer for this level of recursion
    const outputBuffer = root
      .createBuffer(d.arrayOf(d.u32, n))
      .$usage('storage');

    // Up-sweep (reduce) phase
    const upPassSumsBuffer = root
      .createBuffer(d.arrayOf(d.u32, Math.ceil(n / itemsPerWorkgroup)))
      .$usage('storage');

    const upPassBindGroup = root.createBindGroup(upSweepLayout, {
      inputArray: inputBuffer,
      outputArray: outputBuffer,
      sumsArray: upPassSumsBuffer,
    });

    const xGroups = Math.min(Math.ceil(n / itemsPerWorkgroup), maxDispatchSize);
    const yGroups = Math.min(Math.ceil(Math.ceil(n / itemsPerWorkgroup) / maxDispatchSize), maxDispatchSize);
    const zGroups = Math.ceil(Math.ceil(n / itemsPerWorkgroup) / (maxDispatchSize * maxDispatchSize));
    upPassPipeline
      .with(upSweepLayout, upPassBindGroup)
      // .dispatchWorkgroups(Math.ceil(n / itemsPerWorkgroup));
      .dispatchWorkgroups(xGroups, yGroups, zGroups);

    root['~unstable'].flush();

    let sumsScannedBuffer: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag;

    if (n <= itemsPerWorkgroup) {
      sumsScannedBuffer = upPassSumsBuffer; // Not strictly needed but maintains type consistency.
    } else {
      // Recursive step: scan the array of sums.
      sumsScannedBuffer = recursiveScan(upPassSumsBuffer);
    }

    // Down-sweep (scan) phase
    const downSweepOutputBuffer = root
      .createBuffer(d.arrayOf(d.u32, n))
      .$usage('storage');
    const downPassBindGroup = root.createBindGroup(downSweepLayout, {
      inputArray: outputBuffer, // output from up-sweep is input for down-sweep
      outputArray: downSweepOutputBuffer,
    });

    downPassPipeline
      .with(downSweepLayout, downPassBindGroup)
      // .dispatchWorkgroups(Math.ceil(n / itemsPerWorkgroup));
      .dispatchWorkgroups(xGroups, yGroups, zGroups);


    root['~unstable'].flush();

    if (n <= itemsPerWorkgroup) {
      // if n is small enough, return the outputBuffer as the final result
      return downSweepOutputBuffer;
    }

    const finalOutputBuffer = root.createBuffer(
      d.arrayOf(d.u32, n),
    ).$usage('storage');

    const applySumsBindGroup = root.createBindGroup(upSweepLayout, {
      inputArray: downSweepOutputBuffer,
      outputArray: finalOutputBuffer, // This is where we apply the sums to the original input
      sumsArray: sumsScannedBuffer,
    });

    const applyXGroups = Math.min(Math.ceil(n / workgroupSize), maxDispatchSize);
    const applyYGroups = Math.min(Math.ceil(Math.ceil(n / workgroupSize) / maxDispatchSize), maxDispatchSize);
    const applyZGroups = Math.ceil(Math.ceil(n / workgroupSize) / (maxDispatchSize * maxDispatchSize));
    console.log(`Applying sums with groups: ${applyXGroups}, ${applyYGroups}, ${applyZGroups}`);
    applySumsPipeline
      .with(upSweepLayout, applySumsBindGroup)
      // .dispatchWorkgroups(Math.ceil(n / workgroupSize));
      .dispatchWorkgroups(applyXGroups, applyYGroups, applyZGroups);
    root['~unstable'].flush();
    

    return finalOutputBuffer;
  }

  const scannedBuffer = recursiveScan(inputBuffer);
  // const arr = await scannedBuffer.read();
  // if (arr.length > 16776950) {
  //   console.log('Final Buffer (truncated):', arr.slice(16776950, 16776970));
  // } else {
  //   console.log('Final Buffer:', arr);
  // }
  console.log('Final Buffer:', await scannedBuffer.read());
  return scannedBuffer;
}
