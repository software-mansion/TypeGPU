import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';

import {
  downSweepLayout,
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
  const inputLength = inputBuffer.dataType.elementCount;

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

    upPassPipeline
      .with(upSweepLayout, upPassBindGroup)
      .dispatchWorkgroups(Math.ceil(n / itemsPerWorkgroup));

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
      .dispatchWorkgroups(Math.ceil(n / itemsPerWorkgroup));

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

    applySumsPipeline
      .with(upSweepLayout, applySumsBindGroup)
      .dispatchWorkgroups(Math.ceil(n / workgroupSize));
    root['~unstable'].flush();
    

    return finalOutputBuffer;
  }

  const scannedBuffer = recursiveScan(inputBuffer);
  console.log('Final Buffer:', await scannedBuffer.read());
  return scannedBuffer;
}
