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

  const mainArrayBindGroup = root.createBindGroup(dataBindGroupLayout, {
    inputArray: inputBuffer,
    workArray: workBuffer,
    sumsArray: sumsBuffer,
  });

  // Pipelines
  // const scanPipeline = root['~unstable']
  //   .withCompute(computeShaderShared)
  //   .createPipeline()
  //   .$name('scan');

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

  // 1: Bieloch's Block Scan
  upPassPipeline
    .with(dataBindGroupLayout, mainArrayBindGroup)
    .dispatchWorkgroups(1);

  root['~unstable'].flush();
  await root.device.queue.onSubmittedWorkDone();

  // downPassPipeline
  // .with(dataBindGroupLayout, mainArrayBindGroup)
  // .withPerformanceCallback((start, end) => {
  //   const durationNs = Number(end - start);
  //   console.log(
  //     `Block Scan execution time: ${durationNs} ns (${
  //       durationNs / 1000000
  //     } ms)`,
  //   );
  // })
  // .dispatchWorkgroups(inputLength / (workgroupSize * 2) > 1 ? inputLength / (workgroupSize * 2) : 1);

  //buffer.copyFrom //device.queue.copyBufferToBuffer
  // 2: Sums scan
  const numSumBlocks = Math.ceil(
    (inputLength / (workgroupSize * 2)) / (workgroupSize * 2),
  );
  // if (numSumBlocks > 0) {
  //   const resultBuffer = root
  //     .createBuffer(d.arrayOf(d.f32, inputLength))
  //     .$usage('storage');

  //   const sumsArrayBindGroup = root.createBindGroup(dataBindGroupLayout, {
  //     inputArray: sumsBuffer,
  //     workArray: resultBuffer,
  //     sumsArray: root.createBuffer(
  //       d.arrayOf(d.f32, inputLength / workgroupSize * 2),
  //     ).$usage('storage'), // unused but required
  //   });

  //   upPassPipeline.with(dataBindGroupLayout, sumsArrayBindGroup)
  //     .dispatchWorkgroups(numSumBlocks || 1);
  // }
  root['~unstable'].flush();
  await root.device.queue.onSubmittedWorkDone();

  // 3: Apply sums to each block
  // applySumsPipeline
  //   .with(dataBindGroupLayout, mainArrayBindGroup)
  //   .dispatchWorkgroups(Math.ceil(inputLength / workgroupSize));

  // resultBuffer
  //   .read()
  //   .then((result) => {
  //     console.log('Result:', result);
  //   })
  //   .catch((error) => {
  //     console.error('Error reading buffer:', error);
  //   });

  return workBuffer;
}
