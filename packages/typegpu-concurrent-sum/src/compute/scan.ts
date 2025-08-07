import tgpu from 'typegpu';
import {
  identitySlot,
  operatorSlot,
  scanLayout,
  workgroupSize,
} from '../schemas.ts';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const workgroupMemory = tgpu['~unstable'].workgroupVar(
  d.arrayOf(d.f32, workgroupSize),
);

export const scanBlock = tgpu['~unstable'].computeFn({
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

  const partialSums = [d.f32(), 0, 0, 0, 0, 0, 0, 0];
  for (let i = d.u32(); i < 8; i++) {
    if (baseIdx + i < arrayLength) {
      partialSums[i] = scanLayout.$.input[baseIdx + i] as number;
      if (i > 0) {
        (partialSums[i] as number) += partialSums[i - 1] as number;
      }
    }
  }
  // copy to shared memory
  workgroupMemory.$[localIdx] = partialSums[7] as number;

  // Upsweep
  for (let d_val = d.u32(workgroupSize / 2); d_val > 0; d_val >>= 1) {
    std.workgroupBarrier();
    if (localIdx < d_val) {
      const ai = offset * (2 * localIdx + 1) - 1;
      const bi = offset * (2 * localIdx + 2) - 1;
      workgroupMemory.$[bi] = operatorSlot.$(
        workgroupMemory.$[ai],
        workgroupMemory.$[bi] as number,
      );
    }
    offset <<= 1;
  }

  if (localIdx === 0) {
    scanLayout.$.sums[globalWid] = workgroupMemory
      .$[workgroupSize - 1] as number;
    workgroupMemory.$[workgroupSize - 1] = d.f32(identitySlot.$);
  }

  // Downsweep
  for (let d_val = d.u32(1); d_val < workgroupSize; d_val <<= 1) {
    offset >>= 1;
    std.workgroupBarrier();
    if (localIdx < d_val) {
      const ai = offset * (2 * localIdx + 1) - 1;
      const bi = offset * (2 * localIdx + 2) - 1;
      const t = workgroupMemory.$[ai];
      workgroupMemory.$[ai] = workgroupMemory.$[bi] as number;
      workgroupMemory.$[bi] = operatorSlot.$(workgroupMemory.$[bi], t);
    }
  }

  std.workgroupBarrier();

  // copy back to input
  const scannedSum = workgroupMemory.$[localIdx];

  for (let i = d.u32(0); i < 8; i++) {
    if (baseIdx + i < arrayLength) {
      if (i === 0) {
        scanLayout.$.input[baseIdx + i] = scannedSum;
      } else {
        scanLayout.$.input[baseIdx + i] = scannedSum +
          (partialSums[i - 1] as number);
      }
    }
  }
});
