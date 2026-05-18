import tgpu, { d } from 'typegpu';

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

export const convShapeSlot = tgpu.slot({
  input: d.vec3u(1),
  output: d.vec3u(1),
  blocks: d.vec2u(1),
  kernel: d.vec2u(1),
  stride: d.vec2u(1),
  pad: d.vec2u(0),
  total: 1,
});

export const convShapeConst = tgpu.lazy(() => tgpu.const(convShape, convShapeSlot.$));

export const binaryShapeSlot = tgpu.slot({
  output: d.vec3u(1),
  outputBlocks: 1,
  bShape: d.vec2u(1),
  flags: 0,
  total: 1,
});

export const binaryShapeConst = tgpu.lazy(() => tgpu.const(binaryShape, binaryShapeSlot.$));

export const poolShapeSlot = tgpu.slot({
  input: d.vec3u(1),
  blocks: 1,
  window: d.vec2u(1),
});

export const poolShapeConst = tgpu.lazy(() => tgpu.const(poolShape, poolShapeSlot.$));

export const resizeShapeSlot = tgpu.slot({
  input: d.vec3u(1),
  output: d.vec3u(1),
  blocks: 1,
  total: 1,
});

export const resizeShapeConst = tgpu.lazy(() => tgpu.const(resizeShape, resizeShapeSlot.$));

export const headShapeSlot = tgpu.slot({
  input: d.vec3u(1),
  output: d.vec3u(1),
  inputBlocks: 1,
  total: 1,
});

export const headShapeConst = tgpu.lazy(() => tgpu.const(headShape, headShapeSlot.$));

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
