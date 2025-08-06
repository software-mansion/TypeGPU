import tgpu from 'typegpu';
import { operatorSlot, scanLayout, workgroupSize } from '../schemas.ts';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const workgroupMemory = tgpu['~unstable'].workgroupVar(
  d.arrayOf(d.f32, workgroupSize),
);

export const scanGreatestBlock = tgpu['~unstable'].computeFn({
  workgroupSize: [workgroupSize],
  in: {
    gid: d.builtin.globalInvocationId,
    lid: d.builtin.localInvocationId,
    nwg: d.builtin.numWorkgroups,
    wid: d.builtin.workgroupId,
  },
})(({ gid, lid, nwg, wid }) => {
  const globalIdx = gid.x + gid.y * nwg.x + gid.z * nwg.x * nwg.y;
  const globalWid = wid.x + wid.y * nwg.x + wid.z * nwg.x * nwg.y;
  const localIdx = lid.x;
  const arrayLength = scanLayout.$.input.length;
  let offset = d.u32(1);

  // 8 elements per thread
  const baseIdx = globalIdx * 8;

  const elements = [d.f32(0), 0, 0, 0, 0, 0, 0, 0];
  for (let i = d.u32(0); i < 8; i++) {
    if (baseIdx + i < arrayLength) {
      elements[i] = scanLayout.$.input[baseIdx + i] as number;
    }
  }

  const partialSums = [d.f32(0), 0, 0, 0, 0, 0, 0, 0];
  partialSums[0] = elements[0] as number;
  for (let i = d.u32(1); i < 8; i++) {
    partialSums[i] = partialSums[i - 1] as number + (elements[i] as number);
  }
  const totalSum = partialSums[7];

  // copy to shared memory
  workgroupMemory.$[localIdx] = totalSum as number;

  // Upsweep
  for (let d_val = d.u32(workgroupSize / 2); d_val > 0; d_val >>= 1) {
    std.workgroupBarrier();
    if (localIdx < d_val) {
      const ai = offset * (2 * localIdx + 1) - 1;
      const bi = offset * (2 * localIdx + 2) - 1;
      workgroupMemory.$[bi] = operatorSlot.$(
        workgroupMemory.$[bi],
        workgroupMemory.$[ai] as number,
      );
    }
    offset <<= 1;
  }

  if (localIdx === 0) {
    scanLayout.$.sums[globalWid] = workgroupMemory
      .$[workgroupSize - 1] as number;
  }
});
