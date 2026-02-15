import tgpu from 'typegpu';
import {
  identitySlot,
  operatorSlot,
  scanLayout,
  WORKGROUP_SIZE,
} from '../schemas.ts';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const workgroupMemory = tgpu.workgroupVar(
  d.arrayOf(d.f32, WORKGROUP_SIZE),
);

export const scanGreatestBlock = tgpu['~unstable'].computeFn({
  workgroupSize: [WORKGROUP_SIZE],
  in: {
    gid: d.builtin.globalInvocationId,
    lid: d.builtin.localInvocationId,
    wid: d.builtin.workgroupId,
  },
})(({ gid, lid, wid }) => {
  const globalIdx = gid.x;
  const workgroupId = wid.x;
  const localIdx = lid.x;
  const arrayLength = scanLayout.$.input.length;
  let offset = d.u32(1);

  // 8 elements per thread
  const baseIdx = globalIdx * 8;

  const partialSums = [
    d.f32(identitySlot.$),
    d.f32(identitySlot.$),
    d.f32(identitySlot.$),
    d.f32(identitySlot.$),
    d.f32(identitySlot.$),
    d.f32(identitySlot.$),
    d.f32(identitySlot.$),
    d.f32(identitySlot.$),
  ];
  let lastIdx = d.u32(0);
  for (let i = d.u32(); i < 8; i++) {
    if (baseIdx + i < arrayLength) {
      partialSums[i] = operatorSlot.$(
        partialSums[i - 1] as number,
        scanLayout.$.input[baseIdx + i] as number,
      );
      lastIdx = i;
    }
  }
  workgroupMemory.$[localIdx] = partialSums[lastIdx] as number;

  // Upsweep
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

  if (localIdx === 0) {
    scanLayout.$.sums[workgroupId] = workgroupMemory
      .$[WORKGROUP_SIZE - 1] as number;
  }
});
