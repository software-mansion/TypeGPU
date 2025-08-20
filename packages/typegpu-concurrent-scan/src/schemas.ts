import tgpu, { type TgpuFn } from 'typegpu';
import * as d from 'typegpu/data';

export const workgroupSize = 256;
export interface BinaryOp {
  operation: d.TgpuCallable<(a: d.F32, b: d.F32) => d.F32>;
  identityElement: number;
}

export const calculateIndex = tgpu.fn([d.vec3u, d.vec3u], d.u32)((id, nwg) =>
  id.x + id.y * nwg.x + id.z * nwg.x * nwg.y
);
export const scanLayout = tgpu.bindGroupLayout({
  input: { storage: d.arrayOf(d.f32), access: 'mutable' },
  sums: { storage: d.arrayOf(d.f32), access: 'mutable' },
});

export const uniformAddLayout = tgpu.bindGroupLayout({
  input: { storage: d.arrayOf(d.f32), access: 'mutable' },
  sums: { storage: d.arrayOf(d.f32), access: 'readonly' },
});
export const operatorSlot = tgpu.slot<TgpuFn>();
export const identitySlot = tgpu.slot<number>();
