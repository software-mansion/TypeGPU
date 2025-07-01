import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const workgroupSize = 256;
export const fixedArrayLength = 2 ** 16;

export const dataBindGroupLayout = tgpu.bindGroupLayout({
  inputArray: {
    storage: (n: number) => d.arrayOf(d.f32, n),
    access: 'mutable',
  },
  workArray: { storage: (n: number) => d.arrayOf(d.f32, n), access: 'mutable' },
  sumsArray: { storage: (n: number) => d.arrayOf(d.f32, n), access: 'mutable' },
});
