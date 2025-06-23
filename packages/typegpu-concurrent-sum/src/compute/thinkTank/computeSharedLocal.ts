import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  dataBindGroupLayout as layout,
  fixedArrayLength,
  workgroupSize,
} from '../../schemas.ts';

const sharedMem = tgpu['~unstable'].workgroupVar(
  d.arrayOf(d.f32, workgroupSize * 2),
);

export const computeShaderShared = tgpu['~unstable'].computeFn({
  in: {
    lid: d.builtin.localInvocationIndex,
    gid: d.builtin.globalInvocationId,
  },
  workgroupSize: [workgroupSize],
})((input) => {
  const lId = input.lid;
  const gId = input.gid.x;
  const length = d.u32(workgroupSize * 2);
  const log2Length = d.i32(std.log2(d.f32(length)));

  // copy
  const idx0 = gId * 2;
  const idx1 = gId * 2 + 1;
  if (idx0 < d.u32(fixedArrayLength)) {
    sharedMem.value[lId * 2] = layout.$.inputArray[idx0] as number;
  }
  if (idx1 < d.u32(fixedArrayLength)) {
    sharedMem.value[lId * 2 + 1] = layout.$.inputArray[idx1] as number;
  }
  std.workgroupBarrier();

  // Up-sweep phase
  for (let dLevel = 0; dLevel < log2Length; dLevel++) {
    const windowSize = d.u32(std.exp2(d.f32(dLevel + 1))); // window size == step
    const offset = d.u32(std.exp2(d.f32(dLevel))); // offset for the window

    if (lId < (length / (windowSize / 2))) { //workgroup length
      const i = lId * windowSize;
      const leftIdx = i + offset - 1;
      const rightIdx = i + windowSize - 1;

      (sharedMem.value[rightIdx] as number) += sharedMem
        .value[leftIdx] as number;
    }

    std.workgroupBarrier();
  }
  std.workgroupBarrier();

  if (lId === 0) {
    sharedMem.value[length - 1] = 0;
  }

  std.workgroupBarrier();

  // Down-sweep phase
  for (let k = 0; k < log2Length; k++) {
    const dLevel = log2Length - 1 - k;
    const windowSize = d.u32(std.exp2(d.f32(dLevel + 1))); // window size == step
    const offset = d.u32(std.exp2(d.f32(dLevel))); // offset for the window

    if (lId < length / windowSize) {
      const i = lId * windowSize;
      const leftIdx = (i + offset - 1) % (length * 2);
      const rightIdx = (i + windowSize - 1) % (length * 2);

      const temp = sharedMem.value[leftIdx] as number;
      sharedMem.value[leftIdx] = sharedMem.value[rightIdx] as number;
      sharedMem.value[rightIdx] = temp +
        (sharedMem.value[rightIdx] as number);
    }

    std.workgroupBarrier();
  }

  // copy back
  if (idx0 < d.u32(fixedArrayLength)) {
    layout.$.workArray[idx0] = sharedMem.value[lId * 2] as number;
  }
  if (idx1 < d.u32(fixedArrayLength)) {
    layout.$.workArray[idx1] = sharedMem.value[lId * 2 + 1] as number;
  }
});
