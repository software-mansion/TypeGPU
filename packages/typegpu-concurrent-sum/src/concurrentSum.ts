import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';

import {
  downSweepLayout,
  itemsPerThread,
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
  const sumsOfSumsBuffer = outputBufferOpt ?? root
    .createBuffer(d.arrayOf(d.u32, inputLength))
    .$usage('storage');

  const workBuffer = root
    .createBuffer(d.arrayOf(d.u32, inputLength))
    .$usage('storage');

  const sumsBuffer = root
    .createBuffer(
      d.arrayOf(
        d.u32,
        Math.ceil(inputLength / (workgroupSize * itemsPerThread)),
      ),
    )
    .$usage('storage');

  // Pipelines

  const upPassPipeline = root['~unstable']
    .withCompute(computeUpPass)
    .createPipeline()
    .$name('UpScan');

  const downPassPipeline = root['~unstable']
    .withCompute(computeDownPass)
    .createPipeline()
    .$name('UpScan');

  const applySumsPipeline = root['~unstable']
    .withCompute(incrementShader)
    .createPipeline()
    .$name('applySums');

  /* ----------------------- 1: Bieloch's Block Scan ----------------------- */
  // -- Multiple UpPass - small trees (input, work, sums)
  const mainArrayBindGroup = root.createBindGroup(upSweepLayout, {
    inputArray: inputBuffer,
    outputArray: workBuffer,
    sumsArray: sumsBuffer,
  });

  upPassPipeline
    .with(upSweepLayout, mainArrayBindGroup)
    .dispatchWorkgroups(
      inputLength / (workgroupSize * 2) > 1
        ? inputLength / (workgroupSize * 2)
        : 1,
    );

  root['~unstable'].flush();
  await root.device.queue.onSubmittedWorkDone();
  // -- Multiple DownPass - small trees (-, work, -)
  const workBuffer2 = root
    .createBuffer(d.arrayOf(d.u32, inputLength))
    .$usage('storage');

  const mainDownArrayBindGroup = root.createBindGroup(downSweepLayout, {
    inputArray: workBuffer,
    outputArray: workBuffer2,
  });

  downPassPipeline
    .with(downSweepLayout, mainDownArrayBindGroup)
    .dispatchWorkgroups(Math.max(
      inputLength / (workgroupSize * 2),
      1,
    ));
  root['~unstable'].flush();
  await root.device.queue.onSubmittedWorkDone();

  // -- Sum of sums UpPass - (sums, sumOfSums, -)
  const sumsArrayBindGroup = root.createBindGroup(upSweepLayout, {
    inputArray: sumsBuffer,
    outputArray: sumsOfSumsBuffer,
    sumsArray: root.createBuffer(
      d.arrayOf(d.u32, Math.max(1, inputLength / workgroupSize * 2)),
    ).$usage('storage'), // unused but required
  });

  upPassPipeline.with(upSweepLayout, sumsArrayBindGroup)
    .dispatchWorkgroups(
      Math.max(
        (inputLength / (workgroupSize * 2)) / (workgroupSize * 2),
        1,
      ),
    );
  root['~unstable'].flush();
  await root.device.queue.onSubmittedWorkDone();

  // Sum of sums DownPass - (-, sumOfSums, -)
  const sumsOfSumsBuffer2 = outputBufferOpt ?? root
    .createBuffer(d.arrayOf(d.u32, inputLength))
    .$usage('storage');

  const downPassArrayBindGroup = root.createBindGroup(downSweepLayout, {
    inputArray: sumsOfSumsBuffer,
    outputArray: sumsOfSumsBuffer2,
  });
  downPassPipeline
    .with(downSweepLayout, downPassArrayBindGroup)
    .dispatchWorkgroups(Math.max(
      (inputLength / (workgroupSize * 2)) / (workgroupSize * 2),
      1,
    ));
  root['~unstable'].flush();
  await root.device.queue.onSubmittedWorkDone();

  // Apply big sums to each block (-, work, sumOfSums)
  const finalOutputBuffer = root.createBuffer(d.arrayOf(d.u32, inputLength))
    .$usage('storage');
  const prefixSumsArrayBindGroup = root.createBindGroup(upSweepLayout, {
    inputArray: workBuffer2,
    outputArray: finalOutputBuffer,
    sumsArray: sumsOfSumsBuffer2,
  });
  applySumsPipeline
    .with(upSweepLayout, prefixSumsArrayBindGroup)
    .dispatchWorkgroups(Math.ceil(inputLength / workgroupSize));
  root['~unstable'].flush();
  await root.device.queue.onSubmittedWorkDone();

  sumsBuffer
    .read()
    .then((result) => {
      console.log('Sum:', result);
    })
    .catch((error) => {
      console.error('Error reading buffer:', error);
    });

  sumsOfSumsBuffer2
    .read()
    .then((result) => {
      console.log('sums of sums:', result);
    })
    .catch((error) => {
      console.error('Error reading buffer:', error);
    });

  workBuffer2
    .read()
    .then((result) => {
      console.log('Work:', result);
    })
    .catch((error) => {
      console.error('Error reading buffer:', error);
    });

  finalOutputBuffer
    .read()
    .then((result) => {
      console.log('Final Output:', result);
    })
    .catch((error) => {
      console.error('Error reading buffer:', error);
    });
  return finalOutputBuffer;
}
