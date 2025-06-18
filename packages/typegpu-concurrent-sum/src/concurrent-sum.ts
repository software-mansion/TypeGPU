import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import {
  dataBindGroupLayout,
  fixedArrayLength,
  inputValueType,
  workgroupSize,
} from './schemas.ts';
import { computeShader } from './compute.ts';
import type { F32, WgslArray } from 'typegpu/data';
import { computeShaderSharedMem } from './compute-shared-mem.ts';
import { computeShaderInPlace } from './compute-in-place.ts';

export function currentSum(
  root: TgpuRoot,
  inputBuffor: TgpuBuffer<WgslArray<F32>> & StorageFlag,
) {
  const workBuffer = root.createBuffer(inputValueType).$usage('storage');
  const fooBindGroup = root.createBindGroup(dataBindGroupLayout, {
    inputArray: inputBuffor,
    workArray: workBuffer,
  });

  const computePipelineSharedMem = root['~unstable']
    .withCompute(computeShaderSharedMem)
    .createPipeline()
    .$name('compute');

  const computePipeline = root['~unstable']
    .withCompute(computeShader)
    // .withCompute(computeShaderInPlace)
    .createPipeline()
    .$name('compute');

  computePipeline.with(dataBindGroupLayout, fooBindGroup)
    .withPerformanceCallback((start, end) => {
      const durationNs = Number(end - start);
      console.log(
        `Concurrent sum execution time: ${durationNs} ns (${
          durationNs / 1000000
        } ms)`,
      );
    })
    .dispatchWorkgroups(fixedArrayLength / workgroupSize);

    computePipelineSharedMem.with(dataBindGroupLayout, fooBindGroup)
    .withPerformanceCallback((start, end) => {
      const durationNs = Number(end - start);
      console.log(
        `Concurrent sum execution time: ${durationNs} ns (${
          durationNs / 1000000
        } ms)`,
      );
    })
    .dispatchWorkgroups(fixedArrayLength / workgroupSize);


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
