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

export const uniformOpLayout = tgpu.bindGroupLayout({
  input: { storage: d.arrayOf(d.f32), access: 'mutable' },
  sums: { storage: d.arrayOf(d.f32), access: 'readonly' },
});
export const operatorSlot = tgpu.slot<(a: number, b: number) => number>();
export const identitySlot = tgpu['~unstable'].accessor(d.f32);
export const onlyGreatestElementSlot = tgpu.slot<boolean>();
