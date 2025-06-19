import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const workgroupSize = 256;
export const fixedArrayLength = 16776960;
export const inputValueType = d.arrayOf(d.f32, fixedArrayLength);

export const dataBindGroupLayout = tgpu.bindGroupLayout({
  inputArray: { storage: inputValueType, access: 'mutable' },
  workArray: { storage: inputValueType, access: 'mutable' },
});
