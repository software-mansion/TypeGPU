import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  dataBindGroupLayout as layout,
  itemsPerThread,
  workgroupSize,
} from '../schemas.ts';

const sharedMem = tgpu['~unstable'].workgroupVar(
  d.arrayOf(d.u32, workgroupSize * itemsPerThread),
);

export const computeUpPass = tgpu['~unstable'].computeFn({
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

  // Up-sweep phase (reduce)
  for (let dLevel = d.u32(0); dLevel < log2Length; dLevel++) {
    const windowSize = d.u32(1 << (dLevel + 1)); // window size == step
    const offset = d.u32(1 << dLevel); // offset for the window

    if (lid.x < (segmentLength / windowSize)) { //workgroup length
      const i = lid.x * windowSize;
      const leftIdx = i + offset - 1;
      const rightIdx = i + windowSize - 1;

      (sharedMem.value[rightIdx] as number) += sharedMem
        .value[leftIdx] as number;
    }

    std.workgroupBarrier();
  }
  // save to sums
  // if (lid.x === 0) {
  //   layout.$.sumsArray[wid.x] = sharedMem.value[segmentLength - 1] as number;
  //   // sharedMem.value[segmentLength - 1] = 0;
  // }
  std.workgroupBarrier();

  // copy back to work array
  if (idx0 < totalInputLength) {
    layout.$.workArray[idx0] = sharedMem.value[lid.x * 2] as number;
  }
  if (idx1 < totalInputLength) {
    layout.$.workArray[idx1] = sharedMem.value[lid.x * 2 + 1] as number;
  }
});
