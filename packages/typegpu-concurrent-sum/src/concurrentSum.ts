import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import {
  batchType,
  dataBindGroupLayout,
  fixedArrayLength,
  inputValueType,
  workgroupSize,
} from './schemas.ts';
import type { F32, WgslArray } from 'typegpu/data';
import { computeShaderShared } from './compute/computeShared.ts';
import { applySumsShader } from './compute/applySumsShader.ts';

export function currentSum(
  root: TgpuRoot,
  inputBuffor: TgpuBuffer<WgslArray<F32>> & StorageFlag,
) {
  const workBuffer = root.createBuffer(inputValueType).$usage('storage');
  const sumsBuffer = root.createBuffer(batchType).$usage('storage');

  const mainArrayBindGroup = root.createBindGroup(dataBindGroupLayout, {
    inputArray: inputBuffor,
    workArray: workBuffer,
    sumsArray: sumsBuffer,
  });

  const sumsArrayBindGroup = root.createBindGroup(dataBindGroupLayout, {
    inputArray: sumsBuffer, // Use the sums as input
    workArray: sumsBuffer, // Write results back to the sums buffer
    sumsArray: root.createBuffer(batchType).$usage('storage'), // unused but required
  });

  // Pipelines
  const scanPipeline = root['~unstable']
    .withCompute(computeShaderShared)
    .createPipeline()
    .$name('scan');

  const applySumsPipeline = root['~unstable']
    .withCompute(applySumsShader)
    .createPipeline()
    .$name('applySums');

  // 1: Bieloch's Block Scan
  scanPipeline.with(dataBindGroupLayout, mainArrayBindGroup)
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

  return inputBuffor;
}
