import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  dataBindGroupLayout as layout,
  fixedArrayLength,
  workgroupSize,
} from './schemas.ts';

export const computeShaderInPlace = tgpu['~unstable'].computeFn({
  in: { in: d.builtin.globalInvocationId },
  workgroupSize: [workgroupSize],
})((input) => {
  const threadId = input.in.x;
  const length = d.u32(fixedArrayLength);
  const log2Length = d.i32(std.log2(d.f32(length)));

  std.workgroupBarrier();
  // Up-sweep phase
  for (let dLevel = 0; dLevel < log2Length; dLevel++) {
    const windowSize = d.u32(std.exp2(d.f32(dLevel + 1))); // window size == step
    const offset = d.u32(std.exp2(d.f32(dLevel))); // offset for the window

    if (threadId < length / windowSize) {
      const i = threadId * windowSize;
      const leftIdx = i + offset - 1;
      const rightIdx = i + windowSize - 1;

      layout.$.inputArray[rightIdx] = (layout.$.inputArray[leftIdx] as number) +
        (layout.$.inputArray[rightIdx] as number);
    }

    std.workgroupBarrier();
  }

  if (threadId === 0) {
    layout.$.inputArray[length - 1] = 0;
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

      const temp = layout.$.inputArray[leftIdx] as number;
      layout.$.inputArray[leftIdx] = layout.$.inputArray[rightIdx] as number;
      layout.$.inputArray[rightIdx] = temp +
        (layout.$.inputArray[rightIdx] as number);
    }

    std.workgroupBarrier();
  }
});
