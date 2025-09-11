import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { ioLayout } from '../schemas.ts';

export const relu = tgpu.fn([d.f32], d.f32)((x) => std.max(0.0, x));
export const sigmoid = tgpu.fn([d.f32], d.f32)((x) =>
  1.0 / (1.0 + std.exp(-x))
);
export const tanh = tgpu.fn(
  [d.f32],
  d.f32,
)((x) => {
  const e2x = std.exp(2.0 * x);
  return (e2x - 1.0) / (e2x + 1.0);
});

export const identity = tgpu.fn([d.f32], d.f32)((x) => x);

export const softmaxCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [1],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  // Single-thread kernel
  if (gid.x > d.u32(0) || gid.y > d.u32(0) || gid.z > d.u32(0)) return;

  const length = ioLayout.$.outLength;
  if (length === d.u32(0)) return;

  // 1) Max
  let maxVal = ioLayout.$.input[d.u32(0)] as number;
  for (let i = d.u32(1); i < length; i = i + d.u32(1)) {
    const v = ioLayout.$.input[i] as number;
    maxVal = std.max(maxVal, v);
  }

  // 2) Denominator
  let denom = d.f32(0);
  for (let i = d.u32(0); i < length; i = i + d.u32(1)) {
    denom = denom + std.exp((ioLayout.$.input[i] as number) - maxVal);
  }

  // 3) Outputs
  for (let i = d.u32(0); i < length; i = i + d.u32(1)) {
    ioLayout.$.output[i] = std.exp((ioLayout.$.input[i] as number) - maxVal) / denom;
  }
});