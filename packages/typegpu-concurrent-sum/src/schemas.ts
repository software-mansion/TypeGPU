import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const itemsPerThread = 2;
export const workgroupSize = 256;
export const fixedArrayLength = 2 ** 16;

export const dataBindGroupLayout = tgpu.bindGroupLayout({
  inputArray: {
    storage: (n: number) => d.arrayOf(d.u32, n),
    access: 'readonly',
  },
  workArray: { storage: (n: number) => d.arrayOf(d.u32, n), access: 'mutable' },
  sumsArray: { storage: (n: number) => d.arrayOf(d.u32, n), access: 'mutable' },
});
