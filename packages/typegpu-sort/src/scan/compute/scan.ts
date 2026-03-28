import tgpu, { d, std } from 'typegpu';
import {
  ELEMENTS_PER_THREAD,
  ELEMENTS_RANGE,
  identitySlot,
  onlyGreatestElementSlot,
  operatorSlot,
  scanLayout,
  WORKGROUP_SIZE,
} from '../schemas.ts';
import { downsweep, upsweep, workgroupMemory } from './shared.ts';

const fillIdentityArray = tgpu.comptime(() =>
  Array.from({ length: ELEMENTS_PER_THREAD }, () => identitySlot.$),
);

export const computeBlock = tgpu.computeFn({
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

  const baseIdx = globalIdx * ELEMENTS_PER_THREAD;

  const partialSums = d.arrayOf(d.f32, ELEMENTS_PER_THREAD)(fillIdentityArray());

  let prev = identitySlot.$;
  let lastIdx = d.u32(0);

  for (const i of tgpu.unroll(ELEMENTS_RANGE)) {
    if (baseIdx + i < scanLayout.$.input.length) {
      partialSums[i] = operatorSlot.$(prev, scanLayout.$.input[baseIdx + i] as number);
      prev = partialSums[i];
      lastIdx = i;
    }
  }
  workgroupMemory.$[localIdx] = partialSums[lastIdx] as number;

  upsweep(localIdx);

  if (localIdx === 0) {
    scanLayout.$.sums[workgroupId] = workgroupMemory.$[WORKGROUP_SIZE - 1] as number;
    if (!onlyGreatestElementSlot.$) {
      workgroupMemory.$[WORKGROUP_SIZE - 1] = d.f32(identitySlot.$);
    }
  }

  if (!onlyGreatestElementSlot.$) {
    downsweep(localIdx);

    std.workgroupBarrier();

    const scannedSum = workgroupMemory.$[localIdx];

    for (const i of tgpu.unroll(ELEMENTS_RANGE)) {
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
