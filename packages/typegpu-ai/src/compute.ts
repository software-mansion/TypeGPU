import tgpu from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";
import { ioLayout, weightsBiasesLayout } from "./schemas.ts";
import { calculateIndex, workgroupSize } from "./schemas.ts";

export const nnCompute = tgpu["~unstable"].computeFn({
  workgroupSize: [workgroupSize],
  in: {
    gid: d.builtin.globalInvocationId,
    nwg: d.builtin.numWorkgroups,
    wid: d.builtin.workgroupId,
  },
})(({ gid, nwg, wid }) => {
  const globalIdx = calculateIndex(gid, nwg);
  const workgroupId = calculateIndex(wid, nwg);
  const i = globalIdx;

  const inputSize = ioLayout.$.input.length;

  const weightsOffset = i * inputSize;
  let sum = 0.0;

  for (let j = d.u32(0); j < inputSize; j = j + 1) {
    sum =
      sum +
      (ioLayout.$.input[j] as number) *
        (weightsBiasesLayout.$.weights[weightsOffset + j] as number);
  }

  sum = sum + (weightsBiasesLayout.$.biases[i] as number);
  ioLayout.$.output[i] = relu(sum);
});

const relu = tgpu.fn([d.f32], d.f32)((x) => std.max(0.0, x));
const sigmoid = tgpu.fn([d.f32], d.f32)((x) => 1.0 / (1.0 + std.exp(-x)));
const tanh = tgpu.fn(
  [d.f32],
  d.f32,
)((x) => {
  const e2x = std.exp(2.0 * x);
  return (e2x - 1.0) / (e2x + 1.0);
});
