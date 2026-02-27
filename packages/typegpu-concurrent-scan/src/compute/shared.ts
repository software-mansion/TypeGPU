import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { operatorSlot, WORKGROUP_SIZE } from '../schemas.ts';

export const workgroupMemory = tgpu.workgroupVar(
  d.arrayOf(d.f32, WORKGROUP_SIZE),
);

export const upsweep = tgpu.fn([d.u32])((localIdx) => {
  let offset = d.u32(1);
  for (let d_val = d.u32(WORKGROUP_SIZE / 2); d_val > 0; d_val >>= 1) {
    std.workgroupBarrier();
    if (localIdx < d_val) {
      const ai = offset * (2 * localIdx + 1) - 1;
      const bi = offset * (2 * localIdx + 2) - 1;
      workgroupMemory.$[bi] = operatorSlot.$(
        workgroupMemory.$[ai] as number,
        workgroupMemory.$[bi] as number,
      );
    }
    offset <<= 1;
  }
});

export const downsweep = tgpu.fn([d.u32])((localIdx) => {
  let offset = d.u32(WORKGROUP_SIZE);
  for (let d_val = d.u32(1); d_val < WORKGROUP_SIZE; d_val <<= 1) {
    offset >>= 1;
    std.workgroupBarrier();
    if (localIdx < d_val) {
      const ai = offset * (2 * localIdx + 1) - 1;
      const bi = offset * (2 * localIdx + 2) - 1;
      const t = workgroupMemory.$[ai] as number;
      workgroupMemory.$[ai] = workgroupMemory.$[bi] as number;
      workgroupMemory.$[bi] = operatorSlot.$(
        workgroupMemory.$[bi] as number,
        t,
      );
    }
  }
});
