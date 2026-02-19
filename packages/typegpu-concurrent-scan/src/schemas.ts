import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const WORKGROUP_SIZE = 256;
export interface BinaryOp {
  operation: (a: number, b: number) => number;
  identityElement: number;
}

export const scanLayout = tgpu.bindGroupLayout({
  input: { storage: d.arrayOf(d.f32), access: 'mutable' },
  sums: { storage: d.arrayOf(d.f32), access: 'mutable' },
});

export const uniformAddLayout = tgpu.bindGroupLayout({
  input: { storage: d.arrayOf(d.f32), access: 'mutable' },
  sums: { storage: d.arrayOf(d.f32), access: 'readonly' },
});
export const operatorSlot = tgpu.slot<(a: number, b: number) => number>();
export const identitySlot = tgpu.slot<number>();
export const onlyGreatestElementSlot = tgpu.slot<boolean>();
