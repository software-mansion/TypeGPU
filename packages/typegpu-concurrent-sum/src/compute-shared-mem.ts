import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  dataBindGroupLayout as layout,
  fixedArrayLength,
  workgroupSize,
} from './schemas.ts';

const sharedMem = tgpu['~unstable'].workgroupVar(
  d.arrayOf(d.f32, workgroupSize),
);

export const computeShaderSharedMem = tgpu['~unstable'].computeFn({
  in: { lid: d.builtin.localInvocationId, gid: d.builtin.globalInvocationId },
  workgroupSize: [workgroupSize],
})((input) => {
  const localThreadId = input.lid.x;
  const threadId = input.gid.x;
  const length = d.u32(fixedArrayLength);
  const log2Length = d.i32(std.log2(d.f32(length)));

  if (threadId < length) {
    sharedMem.value[localThreadId] = layout.$.inputArray[threadId] as number;
  }

  // Waiting for all threads to copy their values
  std.workgroupBarrier();

  // Up-sweep phase
  for (let dLevel = 0; dLevel < log2Length; dLevel++) {
    const windowSize = d.u32(std.exp2(d.f32(dLevel + 1))); // window size == step
    const offset = d.u32(std.exp2(d.f32(dLevel))); // offset for the window

    if (threadId < length / windowSize) {
      const i = threadId * windowSize;
      const leftIdx = (i + offset - 1) % workgroupSize;
      const rightIdx = (i + windowSize - 1) % workgroupSize;

      (sharedMem.value[rightIdx] as number) += (sharedMem.value[leftIdx] as number);
    }

    std.workgroupBarrier();
  }

  if (threadId === 0) {
    sharedMem.value[length - 1] = 0;
  }

  std.workgroupBarrier();

  // Down-sweep phase
  for (let k = 0; k < log2Length; k++) {
    const dLevel = log2Length - 1 - k;
    const windowSize = d.u32(std.exp2(d.f32(dLevel + 1))); // window size == step
    const offset = d.u32(std.exp2(d.f32(dLevel))); // offset for the window

    if (threadId < length / windowSize) {
      const i = threadId * windowSize;
      const leftIdx = i + offset - 1;
      const rightIdx = i + windowSize - 1;

      const temp = sharedMem.value[leftIdx] as number;
      sharedMem.value[leftIdx] = sharedMem.value[rightIdx] as number;
      sharedMem.value[rightIdx] = temp +
        (sharedMem.value[rightIdx] as number);
    }

    std.workgroupBarrier();
  }

  if (threadId < length) {
    layout.$.workArray[threadId] = sharedMem.value[localThreadId] as number; // we copy it back, so huge overhead?
  }
});
