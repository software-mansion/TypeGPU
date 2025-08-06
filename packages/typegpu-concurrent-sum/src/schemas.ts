import tgpu, { TgpuFn } from 'typegpu';
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
export const operatorSlot = tgpu.slot<TgpuFn>();
export const identitySlot = tgpu.slot<number>();
