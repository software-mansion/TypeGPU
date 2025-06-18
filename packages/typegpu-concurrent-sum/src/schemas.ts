import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const fixedArrayLength = 256;
export const inputValueType = d.arrayOf(d.f32, fixedArrayLength);

export const dataBindGroupLayout = tgpu.bindGroupLayout({
  inputArray: { storage: inputValueType, access: 'mutable' },
  workArray: { storage: inputValueType, access: 'mutable' },
});
