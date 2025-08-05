import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const workgroupSize = 256;

export const scanLayout = tgpu.bindGroupLayout({
  input: { storage: (n: number) => d.arrayOf(d.f32, n), access: 'mutable' },
  sums: { storage: (n: number) => d.arrayOf(d.f32, n), access: 'mutable' },
});

export const uniformAddLayout = tgpu.bindGroupLayout({
  input: { storage: (n: number) => d.arrayOf(d.f32, n), access: 'mutable' },
  sums: { storage: (n: number) => d.arrayOf(d.f32, n), access: 'readonly' },
});
