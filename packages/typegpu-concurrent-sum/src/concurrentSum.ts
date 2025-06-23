import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import { batchType, dataBindGroupLayout, fixedArrayLength, inputValueType, workgroupSize } from './schemas.ts';
import type { F32, WgslArray } from 'typegpu/data';
import { computeShaderShared } from './compute/computeShared.ts';
import { applySumsShader, scanBlockSumsShader } from './compute/applySumsShader.ts';

export function currentSum(
  root: TgpuRoot,
  inputBuffor: TgpuBuffer<WgslArray<F32>> & StorageFlag,
) {
  const workBuffer = root.createBuffer(inputValueType).$usage('storage');
  const sumsBuffer = root.createBuffer(batchType).$usage('storage');
  const fooBindGroup = root.createBindGroup(dataBindGroupLayout, {
    inputArray: inputBuffor,
    workArray: workBuffer,
    sumsArray: sumsBuffer
  });

  const computePipelineSharedMem = root['~unstable']
    .withCompute(computeShaderShared)
    .createPipeline()
    .$name('blockScan');

  const scanSumsPipeline = root['~unstable']
    .withCompute(scanBlockSumsShader)
    .createPipeline()
    .$name('scanSums');

  const applySumsPipeline = root['~unstable']
    .withCompute(applySumsShader)
    .createPipeline()
    .$name('applySums');


  // 1: scan each block and collect block sums
  computePipelineSharedMem.with(dataBindGroupLayout, fooBindGroup)
    .withPerformanceCallback((start, end) => {
      const durationNs = Number(end - start);
      console.log(
        `Block Scan execution time: ${durationNs} ns (${
          durationNs / 1000000
        } ms)`,
      );
    })
    .dispatchWorkgroups(fixedArrayLength / (workgroupSize * 2));

  // 2: Scan the sums array
  scanSumsPipeline.with(dataBindGroupLayout, fooBindGroup)
    .withPerformanceCallback((start, end) => {
      const durationNs = Number(end - start);
      console.log(
        `Scan Sums execution time: ${durationNs} ns (${
          durationNs / 1000000
        } ms)`,
      );
    })
    .dispatchWorkgroups(1); // Single workgroup for sequential scan

  // 3: Apply scanned sums to each block
  applySumsPipeline.with(dataBindGroupLayout, fooBindGroup)
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
