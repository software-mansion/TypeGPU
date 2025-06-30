import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';

import {
  dataBindGroupLayout,
  fixedArrayLength,
  workgroupSize,
} from './schemas.ts';
import type { F32, WgslArray } from 'typegpu/data';
import { computeShaderShared } from './compute/computeShared.ts';
import { incrementShader } from './compute/incrementShader.ts';

export function currentSum(
  root: TgpuRoot,
  inputBuffer: TgpuBuffer<WgslArray<F32>> & StorageFlag,
) {
  const dynamicInputBufferLength = inputBuffer.dataType.elementCount;
  const workBuffer = root.createBuffer(
    d.arrayOf(d.f32, dynamicInputBufferLength),
  ).$usage('storage');
  const sumsBuffer = root.createBuffer(
    d.arrayOf(d.f32, dynamicInputBufferLength / workgroupSize * 2),
  ).$usage('storage');

  const mainArrayBindGroup = root.createBindGroup(dataBindGroupLayout, {
    inputArray: inputBuffer,
    workArray: workBuffer,
    sumsArray: sumsBuffer,
  });

  const sumsArrayBindGroup = root.createBindGroup(dataBindGroupLayout, {
    inputArray: sumsBuffer,
    workArray: sumsBuffer,
    sumsArray: root.createBuffer(
      d.arrayOf(d.f32, dynamicInputBufferLength / workgroupSize * 2),
    ).$usage('storage'), // unused but required
  });

  // Pipelines
  const scanPipeline = root['~unstable']
    .withCompute(computeShaderShared)
    .createPipeline()
    .$name('scan');

  const applySumsPipeline = root['~unstable']
    .withCompute(incrementShader)
    .createPipeline()
    .$name('applySums');

  // 1: Bieloch's Block Scan
  scanPipeline
    .with(dataBindGroupLayout, mainArrayBindGroup)
    .withPerformanceCallback((start, end) => {
      const durationNs = Number(end - start);
      console.log(
        `Block Scan execution time: ${durationNs} ns (${
          durationNs / 1000000
        } ms)`,
      );
    })
    .dispatchWorkgroups(fixedArrayLength / (workgroupSize * 2));

  // 2: Sums scan
  const numSumBlocks = Math.ceil(
    (fixedArrayLength / (workgroupSize * 2)) / (workgroupSize * 2),
  );
  if (numSumBlocks > 0) {
    scanPipeline.with(dataBindGroupLayout, sumsArrayBindGroup)
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

  workBuffer
    .read()
    .then((result) => {
      console.log('Result:', result);
    })
    .catch((error) => {
      console.error('Error reading buffer:', error);
    });

  // COMPUTE EXPECTED
  const arr = [...Array(fixedArrayLength).keys()];
  // slice off the last element
  arr.slice(0, fixedArrayLength - 1).map((v) => v + 1);
  console.log(
    'Expected sum: ',
    arr.reduce((accumulator, currentValue) => accumulator + currentValue, 0),
  );

  return inputBuffer;
}
