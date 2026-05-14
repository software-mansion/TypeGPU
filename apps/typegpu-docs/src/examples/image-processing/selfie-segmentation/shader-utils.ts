import tgpu, { d, std } from 'typegpu';

export const hwc4Index = tgpu.fn(
  [d.u32, d.u32, d.u32, d.u32, d.u32],
  d.u32,
)((y, x, blockC, width, c4) => {
  'use gpu';
  return (y * width + x) * c4 + blockC;
});

export const sigmoidScalar = tgpu.fn(
  [d.f32],
  d.f32,
)((value) => {
  'use gpu';
  return 1 / (1 + std.exp(-value));
});
