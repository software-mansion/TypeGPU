import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { dataBindGroupLayout } from './schemas.ts';

export const workGroupSize = 256;

const { inputArray } = dataBindGroupLayout.bound;

export const computeShader = tgpu['~unstable'].computeFn({
  in: { in: d.builtin.globalInvocationId },
  workgroupSize: [workGroupSize],
})((input) => {
  const threadId = input.in.x;
  const length = d.u32(1024);

  const log2Length = d.i32(std.log2(d.f32(length)));

  if (threadId === 0) {
    // === Up-sweep ===
    for (let dLevel = 0; dLevel < log2Length; dLevel++) {
      const step = d.u32(std.exp2(d.f32(dLevel + 1)));
      const offset = d.u32(std.exp2(d.f32(dLevel)));

      for (let i = 0; i < length; i += step) {
        const leftIdx = i + offset - 1;
        const rightIdx = i + step - 1;

        inputArray.value.in[rightIdx] =
          (inputArray.value.in[leftIdx] as number) +
          (inputArray.value.in[rightIdx] as number);
      }
    }

    // === Down-sweep ===
    inputArray.value.in[length - 1] = 0;

    for (let k = 0; k < log2Length; k++) {
      const dLevel = log2Length - 1 - k;
      const step = d.u32(std.exp2(d.f32(dLevel + 1)));
      const offset = d.u32(std.exp2(d.f32(dLevel)));

      for (let i = 0; i < length; i += step) {
        const leftIdx = i + offset - 1;
        const rightIdx = i + step - 1;

        const temp = inputArray.value.in[leftIdx] as number;
        inputArray.value.in[leftIdx] = inputArray.value.in[rightIdx] as number;
        inputArray.value.in[rightIdx] = temp +
          (inputArray.value.in[rightIdx] as number);
      }
    }
  }

  std.workgroupBarrier();
});
