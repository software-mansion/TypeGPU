import tgpu from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";

export const relu = tgpu.fn([d.f32], d.f32)((x) => std.max(0.0, x));
export const sigmoid = tgpu.fn([d.f32], d.f32)((x) => 1.0 / (1.0 + std.exp(-x)));
export const tanh = tgpu.fn(
  [d.f32],
  d.f32,
)((x) => {
  const e2x = std.exp(2.0 * x);
  return (e2x - 1.0) / (e2x + 1.0);
});