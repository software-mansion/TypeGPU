import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const workgroupSize = 256;
export const fixedArrayLength = 2 ** 16;
// export const inputValueType = d.arrayOf(d.f32, fixedArrayLength);
// export const batchType = d.arrayOf(d.f32, fixedArrayLength / workgroupSize * 2);

export const dataBindGroupLayout = tgpu.bindGroupLayout({
  // inputArray: { storage: inputValueType, access: 'readonly' },
  inputArray: {
    storage: (n: number) => d.arrayOf(d.f32, n),
    access: 'readonly',
  },
  workArray: { storage: (n: number) => d.arrayOf(d.f32, n), access: 'mutable' },
  sumsArray: { storage: (n: number) => d.arrayOf(d.f32, n), access: 'mutable' },
});
