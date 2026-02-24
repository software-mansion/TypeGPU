import tgpu from 'typegpu';
import {
  identitySlot,
  onlyGreatestElementSlot,
  operatorSlot,
  scanLayout,
  WORKGROUP_SIZE,
} from '../schemas.ts';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { downsweep, upsweep, workgroupMemory } from './shared.ts';

const fillIdentityArray = tgpu.comptime(() =>
  Array.from({ length: 8 }, () => identitySlot.$)
);

export const computeBlock = tgpu['~unstable'].computeFn({
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

  // 8 elements per thread
  const baseIdx = globalIdx * 8;

  const partialSums = d.arrayOf(d.f32, 8)(fillIdentityArray());

  let prev = identitySlot.$;
  let lastIdx = d.u32(0);

  // TODO: use `tgpu.unroll(8)`
  for (let i = d.u32(); i < 8; i++) {
    if (baseIdx + i < scanLayout.$.input.length) {
      partialSums[i] = operatorSlot.$(
        prev,
        scanLayout.$.input[baseIdx + i] as number,
      );
      prev = partialSums[i] as number;
      lastIdx = i;
    }
  }
  workgroupMemory.$[localIdx] = partialSums[lastIdx] as number;

  upsweep(localIdx);

  if (localIdx === 0) {
    scanLayout.$.sums[workgroupId] = workgroupMemory
      .$[WORKGROUP_SIZE - 1] as number;
    if (!onlyGreatestElementSlot.$) {
      workgroupMemory.$[WORKGROUP_SIZE - 1] = d.f32(identitySlot.$);
    }
  }

  if (!onlyGreatestElementSlot.$) {
    downsweep(localIdx);

    std.workgroupBarrier();

    const scannedSum = workgroupMemory.$[localIdx];

    for (let i = d.u32(0); i < 8; i++) {
      if (baseIdx + i < scanLayout.$.input.length) {
        if (i === 0) {
          scanLayout.$.input[baseIdx + i] = scannedSum;
        } else {
          scanLayout.$.input[baseIdx + i] = operatorSlot.$(
            scannedSum,
            partialSums[i - 1] as number,
          );
        }
      }
    }
  }
});
