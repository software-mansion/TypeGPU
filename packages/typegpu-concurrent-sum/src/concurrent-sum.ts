import tgpu from 'typegpu';
import { dataBindGroupLayout, inputValueType } from './schemas.ts';

const root = await tgpu.init();
export const calculateConcurrentSum = tgpu['~unstable'].fn([])(() => {
  const buffer = root.createBuffer(inputValueType).$usage('storage');

  const fooBindGroup = root.createBindGroup(dataBindGroupLayout, {
    inputArray: buffer,
  });

  const result = buffer.read();
  console.log('Result:', result);
});
