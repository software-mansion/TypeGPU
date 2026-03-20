import tgpu, { d } from 'typegpu';

export const WORKGROUP_SIZE = 256;
export const ELEMENTS_PER_THREAD = 8;
export const ELEMENTS_RANGE = Array.from({ length: ELEMENTS_PER_THREAD }, (_, i) => i);

export const scanLayout = tgpu.bindGroupLayout({
  input: { storage: d.arrayOf(d.f32), access: 'mutable' },
  sums: { storage: d.arrayOf(d.f32), access: 'mutable' },
});

export const uniformOpLayout = tgpu.bindGroupLayout({
  input: { storage: d.arrayOf(d.f32), access: 'mutable' },
  sums: { storage: d.arrayOf(d.f32), access: 'readonly' },
});

export const operatorSlot = tgpu.slot<(a: number, b: number) => number>();
export const identitySlot = tgpu.accessor(d.f32);
export const onlyGreatestElementSlot = tgpu.slot<boolean>();
