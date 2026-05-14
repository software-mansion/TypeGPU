import tgpu, { d, std } from 'typegpu';

export const weightedOffsets = d.struct({
  weightBase: d.u32,
  biasBase: d.u32,
});

export const convShape = d.struct({
  input: d.vec3u,
  output: d.vec3u,
  blocks: d.vec2u,
  kernel: d.vec2u,
  stride: d.vec2u,
  pad: d.vec2u,
  total: d.u32,
});

export const binaryShape = d.struct({
  output: d.vec3u,
  outputBlocks: d.u32,
  bShape: d.vec2u,
  flags: d.u32,
  total: d.u32,
});

export const poolShape = d.struct({
  input: d.vec3u,
  blocks: d.u32,
  window: d.vec2u,
});

export const resizeShape = d.struct({
  input: d.vec3u,
  output: d.vec3u,
  blocks: d.u32,
  total: d.u32,
});

export const headShape = d.struct({
  input: d.vec3u,
  output: d.vec3u,
  inputBlocks: d.u32,
  total: d.u32,
});

export const convShapeAccess = tgpu.accessor(convShape, {
  input: d.vec3u(1),
  output: d.vec3u(1),
  blocks: d.vec2u(1),
  kernel: d.vec2u(1),
  stride: d.vec2u(1),
  pad: d.vec2u(0),
  total: 1,
});

export const binaryShapeAccess = tgpu.accessor(binaryShape, {
  output: d.vec3u(1),
  outputBlocks: 1,
  bShape: d.vec2u(1),
  flags: 0,
  total: 1,
});

export const poolShapeAccess = tgpu.accessor(poolShape, {
  input: d.vec3u(1),
  blocks: 1,
  window: d.vec2u(1),
});

export const resizeShapeAccess = tgpu.accessor(resizeShape, {
  input: d.vec3u(1),
  output: d.vec3u(1),
  blocks: 1,
  total: 1,
});

export const headShapeAccess = tgpu.accessor(headShape, {
  input: d.vec3u(1),
  output: d.vec3u(1),
  inputBlocks: 1,
  total: 1,
});

export const weightedLayout = tgpu.bindGroupLayout({
  offsets: { uniform: weightedOffsets },
  src: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  weights: { storage: d.arrayOf(d.u32), access: 'readonly' },
  dst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

export const headLayout = tgpu.bindGroupLayout({
  offsets: { uniform: weightedOffsets },
  src: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  weights: { storage: d.arrayOf(d.u32), access: 'readonly' },
  dst: { storage: d.arrayOf(d.f32), access: 'mutable' },
});

export const binaryLayout = tgpu.bindGroupLayout({
  a: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  b: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  dst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

export const poolLayout = tgpu.bindGroupLayout({
  src: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  dst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

export type Vec4Op = (value: d.v4f) => d.v4f;
export type BinaryOp = (a: d.v4f, b: d.v4f) => d.v4f;

export const identityOp = (value: d.v4f) => {
  'use gpu';
  return d.vec4f(value);
};

export const reluOp = (value: d.v4f) => {
  'use gpu';
  return std.max(value, d.vec4f(0));
};

export const hardSwishOp = (value: d.v4f) => {
  'use gpu';
  return value * std.saturate((value + 3) / 6);
};

export const sigmoidOp = (value: d.v4f) => {
  'use gpu';
  return d.vec4f(1) / (d.vec4f(1) + std.exp(value * -1));
};

export const addOp = (a: d.v4f, b: d.v4f) => {
  'use gpu';
  return a + b;
};

export const mulOp = (a: d.v4f, b: d.v4f) => {
  'use gpu';
  return a * b;
};

export const activationSlot = tgpu.slot<Vec4Op>(identityOp);
export const binaryOpSlot = tgpu.slot<BinaryOp>(addOp);
