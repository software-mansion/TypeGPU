import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const workgroupSize = 256;
export const fixedArrayLength = 2048;
export const inputValueType = d.arrayOf(d.f32, fixedArrayLength);
export const batchType = d.arrayOf(d.f32, fixedArrayLength / workgroupSize * 2);

export const dataBindGroupLayout = tgpu.bindGroupLayout({
  inputArray: { storage: inputValueType, access: 'readonly' },
  workArray: { storage: inputValueType, access: 'mutable' },
  sumsArray: { storage: batchType, access: 'mutable' },
});
