import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import { dataBindGroupLayout, inputValueType } from './schemas.ts';
import { computeShader } from './compute.ts';
import type { F32, WgslArray } from 'typegpu/data';

export function currentSum(
  root: TgpuRoot,
  inputBuffor: TgpuBuffer<WgslArray<F32>> & StorageFlag,
) {
  const workBuffer = root.createBuffer(inputValueType).$usage('storage');
  const fooBindGroup = root.createBindGroup(dataBindGroupLayout, {
    inputArray: inputBuffor,
    workArray: workBuffer,
  });

  const computePipeline = root['~unstable']
    .withCompute(computeShader)
    .createPipeline()
    .$name('compute');

  computePipeline.with(dataBindGroupLayout, fooBindGroup).dispatchWorkgroups(1);

  workBuffer
    .read()
    .then((result) => {
      console.log('Result:', result);
    })
    .catch((error) => {
      console.error('Error reading buffer:', error);
    });

  return workBuffer;
}
