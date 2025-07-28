import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const itemsPerThread = 2;
export const workgroupSize = 256;
export const maxDispatchSize = 65535;

export const upSweepLayout = tgpu.bindGroupLayout({
  inputArray: {
    storage: (n: number) => d.arrayOf(d.u32, n),
    access: 'readonly',
  },
  outputArray: {
    storage: (n: number) => d.arrayOf(d.u32, n),
    access: 'mutable',
  },
  sumsArray: { storage: (n: number) => d.arrayOf(d.u32, n), access: 'mutable' },
});

export const downSweepLayout = tgpu.bindGroupLayout({
  inputArray: {
    storage: (n: number) => d.arrayOf(d.u32, n),
    access: 'readonly',
  },
  outputArray: {
    storage: (n: number) => d.arrayOf(d.u32, n),
    access: 'mutable',
  },
});
