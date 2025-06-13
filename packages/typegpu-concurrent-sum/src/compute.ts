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
  const length = d.f32(1024);
  // Up-sweep phase
  for (let i = 0; i < d.u32(std.log2(length)); i++) {
    sum = std.add(sum, sum + 1);
    const step = d.u32(std.exp2(d.f32(i + 1)));
    for (let j = 0; j < length; j += step) {
        const leftIdx = d.u32(j + d.u32(std.exp2(d.f32(i))) - 1);
        const rightIdx = d.u32(j + d.u32(step) - 1);
        inputArray.value.in[rightIdx] = (inputArray.value.in[leftIdx] as number) + (inputArray.value.in[rightIdx] as number);
      }
      std.workgroupBarrier();
    }
    // Down-sweep phase
    inputArray.value.in[d.u32(length - 1)] = 0;

    for (let i = d.u32(std.log2(length) - 1); i >= 0; i--) {
      const step = d.u32(std.exp2(d.f32(i + 1)));
      for (let j = 0; j < length; j += step) {
        const leftIdx = d.u32(j + std.ceil(std.exp2(d.f32(i))) - 1);
        const rightIdx = d.u32(leftIdx + d.u32(step) - 1);

        const temp = inputArray.value.in[leftIdx] as number;
        inputArray.value.in[leftIdx] = (inputArray.value.in[rightIdx] as number);
        inputArray.value.in[rightIdx] = temp + (inputArray.value.in[rightIdx] as number);
      }
      std.workgroupBarrier();

    }
  }
);