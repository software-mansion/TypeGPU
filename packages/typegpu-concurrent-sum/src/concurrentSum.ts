import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';

import {
  dataBindGroupLayout,
  itemsPerThread,
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
  const mainArrayBindGroup = root.createBindGroup(dataBindGroupLayout, {
    inputArray: inputBuffer,
    workArray: workBuffer,
    sumsArray: sumsBuffer,
  });

  upPassPipeline
    .with(dataBindGroupLayout, mainArrayBindGroup)
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

  const mainDownArrayBindGroup = root.createBindGroup(dataBindGroupLayout, {
    inputArray: workBuffer,
    workArray: workBuffer2,
    sumsArray: sumsBuffer,
  });

  downPassPipeline
    .with(dataBindGroupLayout, mainDownArrayBindGroup)
    .dispatchWorkgroups(Math.max(
      inputLength / (workgroupSize * 2),
      1,
    ));
  root['~unstable'].flush();

  // -- Sum of sums UpPass - (sums, sumOfSums, -)
  const sumsArrayBindGroup = root.createBindGroup(dataBindGroupLayout, {
    inputArray: sumsBuffer,
    workArray: sumsOfSumsBuffer,
    sumsArray: root.createBuffer(
      d.arrayOf(d.u32, Math.max(1, inputLength / workgroupSize * 2)),
    ).$usage('storage'), // unused but required
  });

  upPassPipeline.with(dataBindGroupLayout, sumsArrayBindGroup)
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

  const downPassArrayBindGroup = root.createBindGroup(dataBindGroupLayout, {
    inputArray: sumsOfSumsBuffer,
    workArray: sumsOfSumsBuffer2,
    sumsArray: root.createBuffer(
      d.arrayOf(d.u32, inputLength),
    ).$usage('storage'), // unused but required
  });
  downPassPipeline
    .with(dataBindGroupLayout, downPassArrayBindGroup)
    .dispatchWorkgroups(Math.max(
      (inputLength / (workgroupSize * 2)) / (workgroupSize * 2),
      1,
    ));
  root['~unstable'].flush();
  await root.device.queue.onSubmittedWorkDone();

  // Apply big sums to each block (-, work, sumOfSums)
  const finalOutputBuffer = root.createBuffer(d.arrayOf(d.u32, inputLength))
    .$usage('storage');
  const prefixSumsArrayBindGroup = root.createBindGroup(dataBindGroupLayout, {
    inputArray: workBuffer2,
    workArray: finalOutputBuffer,
    sumsArray: sumsOfSumsBuffer2,
  });
  applySumsPipeline
    .with(dataBindGroupLayout, prefixSumsArrayBindGroup)
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
