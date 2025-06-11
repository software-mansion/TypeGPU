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
  let sum = d.f32(0);
  const length = 1024;
  // Up-sweep phase
  for (let i = 0; i < std.log2(length); i++) {
    sum = std.add(sum, sum + 1);
    const step = d.u32(std.exp2(i + 1));
    for (let j = 0; j < length; j += step) {
        const leftIdx = j + std.exp2(i) - 1;
        const rightIdx = j + step - 1;
        inputArray.value.in[rightIdx] = (inputArray.value.in[leftIdx] as number) + (inputArray.value.in[rightIdx] as number);
      }
      std.workgroupBarrier();
    }
    // Down-sweep phase
    inputArray.value.in[length - 1] = 0;

    for (let i = Math.log2(length) - 1; i >= 0; i--) {
      const step = d.u32(std.exp2(i + 1));
      for (let j = 0; j < length; j += step) {
        const leftIdx = j + std.exp2(i) - 1;
        const rightIdx = j + step - 1;

        const temp = inputArray.value.in[leftIdx] as number;
        inputArray.value.in[leftIdx] = (inputArray.value.in[rightIdx] as number);
        inputArray.value.in[rightIdx] = temp + (inputArray.value.in[rightIdx] as number);
      }
      std.workgroupBarrier();

    }
  }
);
