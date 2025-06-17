import tgpu, { type StorageFlag, type TgpuBuffer } from 'typegpu';
import { dataBindGroupLayout, inputValueType } from './schemas.ts';
import { computeShader } from './compute.ts';
import type { F32, WgslArray, WgslStruct } from 'typegpu/data';

const root = await tgpu.init();

export function currentSum(
  inputBuffor: TgpuBuffer<WgslStruct<{ in: WgslArray<F32> }>> & StorageFlag,
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

  return fooBindGroup;
}
