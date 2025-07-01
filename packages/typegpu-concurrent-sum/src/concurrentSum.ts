import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';

import {
  dataBindGroupLayout,
  fixedArrayLength,
  workgroupSize,
} from './schemas.ts';
import type { F32, WgslArray } from 'typegpu/data';
import { incrementShader } from './compute/incrementShader.ts';
import { computeUpPass } from './compute/computeUpPass.ts';
import { computeDownPass } from './compute/computeDownPass.ts';

export async function currentSum(
  root: TgpuRoot,
  inputBuffer: TgpuBuffer<WgslArray<F32>> & StorageFlag,
  outputBuffer?: TgpuBuffer<WgslArray<F32>> & StorageFlag,
) {
  const dynamicInputBufferLength = inputBuffer.dataType.elementCount;
  
  const workBuffer = outputBuffer ?? root.createBuffer(
    d.arrayOf(d.f32, dynamicInputBufferLength),
  ).$usage('storage')
    .$name('workBuffer');
  const sumsBuffer = root.createBuffer(
    d.arrayOf(d.f32, dynamicInputBufferLength / workgroupSize * 2),
  ).$usage('storage')
    .$name('sumsBuffer');
  const resultBuffer = root.createBuffer(
    d.arrayOf(d.f32, dynamicInputBufferLength / workgroupSize * 2),
  ).$usage('storage')
    .$name('sumsBuffer');

  const mainArrayBindGroup = root.createBindGroup(dataBindGroupLayout, {
    inputArray: inputBuffer,
    workArray: workBuffer,
    sumsArray: sumsBuffer,
  });

  const sumsArrayBindGroup = root.createBindGroup(dataBindGroupLayout, {
    inputArray: sumsBuffer,
    workArray: resultBuffer,
    sumsArray: root.createBuffer(
      d.arrayOf(d.f32, dynamicInputBufferLength / workgroupSize * 2),
    ).$usage('storage'), // unused but required
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
    .withPerformanceCallback((start, end) => {
      const durationNs = Number(end - start);
      console.log(
        `Block Scan execution time: ${durationNs} ns (${
          durationNs / 1000000
        } ms)`,
      );
    })
    .dispatchWorkgroups(
      dynamicInputBufferLength / (workgroupSize * 2) > 1
        ? dynamicInputBufferLength / (workgroupSize * 2)
        : 1,
    );

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
  // .dispatchWorkgroups(dynamicInputBufferLength / (workgroupSize * 2) > 1 ? dynamicInputBufferLength / (workgroupSize * 2) : 1);

  //buffer.copyFrom //device.queue.copyBufferToBuffer
  // 2: Sums scan
  const numSumBlocks = Math.ceil(
    (dynamicInputBufferLength / (workgroupSize * 2)) / (workgroupSize * 2),
  );
  if (numSumBlocks > 0) {
    upPassPipeline.with(dataBindGroupLayout, sumsArrayBindGroup)
      .withPerformanceCallback((start, end) => {
        const durationNs = Number(end - start);
        console.log(
          `Scan Sums execution time: ${durationNs} ns (${
            durationNs / 1000000
          } ms)`,
        );
      })
      .dispatchWorkgroups(numSumBlocks || 1);
  }
  await root.device.queue.onSubmittedWorkDone();

  // 3: Apply sums to each block
  applySumsPipeline.with(dataBindGroupLayout, mainArrayBindGroup)
    .withPerformanceCallback((start, end) => {
      const durationNs = Number(end - start);
      console.log(
        `Apply Sums execution time: ${durationNs} ns (${
          durationNs / 1000000
        } ms)`,
      );
    })
    .dispatchWorkgroups(Math.ceil(fixedArrayLength / workgroupSize));

  resultBuffer
    .read()
    .then((result) => {
      console.log('Result:', result);
    })
    .catch((error) => {
      console.error('Error reading buffer:', error);
    });

  // COMPUTE EXPECTED
  const arr = [...Array(dynamicInputBufferLength - 1).keys()];
  console.log(
    'Expected sum: ',
    arr.reduce((accumulator, currentValue) => accumulator + currentValue, 0),
  );

  return inputBuffer;
}
