import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { dataBindGroupLayout as layout, workgroupSize } from '../schemas.ts';

const sharedMem = tgpu['~unstable'].workgroupVar(
  d.arrayOf(d.u32, workgroupSize * 2),
);

export const computeDownPass = tgpu['~unstable'].computeFn({
  in: {
    lid: d.builtin.localInvocationId,
    gid: d.builtin.globalInvocationId,
    wid: d.builtin.workgroupId,
  },
  workgroupSize: [workgroupSize, 1, 1],
})(({ lid, gid, wid }) => {
  const gId = gid.x;
  const segmentLength = d.u32(workgroupSize * 2);
  const log2Length = d.u32(std.ceil(std.log2(d.f32(segmentLength))));

  const totalInputLength = layout.$.inputArray.length;

  // Copy input data to shared memory
  const idx0 = gId * 2;
  const idx1 = gId * 2 + 1;
  if (idx0 < totalInputLength) {
    sharedMem.value[lid.x * 2] = layout.$.inputArray[idx0] as number;
  }
  if (idx1 < totalInputLength) {
    sharedMem.value[lid.x * 2 + 1] = layout.$.inputArray[idx1] as number;
  }
  std.workgroupBarrier();

  // // Down-sweep phase
  // Set the last element to 0 (identity element for the scan)
  if (lid.x === 0) {
    sharedMem.value[segmentLength - 1] = 0;
  }
  std.workgroupBarrier();

  // Down-sweep phase (distribution)
  for (let k = d.u32(0); k < log2Length; k++) {
    const dLevel = log2Length - 1 - k;
    const windowSize = d.u32(1 << (dLevel + 1)); // window size == step
    const offset = d.u32(1 << dLevel); // offset for the window

    if (lid.x < (segmentLength / windowSize)) {
      const i = lid.x * windowSize;
      const leftIdx = i + offset - 1;
      const rightIdx = i + windowSize - 1;

      const temp = sharedMem.value[leftIdx] as number;
      sharedMem.value[leftIdx] = sharedMem.value[rightIdx] as number;
      sharedMem.value[rightIdx] = temp + (sharedMem.value[rightIdx] as number);
    }

    std.workgroupBarrier();
  }

  // copy back to work array
  if (idx0 < d.u32(totalInputLength)) {
    layout.$.workArray[idx0] = sharedMem.value[lid.x * 2] as number;
  }
  if (idx1 < d.u32(totalInputLength)) {
    layout.$.workArray[idx1] = sharedMem.value[lid.x * 2 + 1] as number;
  }
});
