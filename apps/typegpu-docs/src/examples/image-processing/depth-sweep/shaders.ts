import { d, std, tgpu } from 'typegpu';

export const DEPTH_WORKGROUP_SIZE = 64;
export const COLORIZE_WORKGROUP_SIZE = 8;

const RANGE_BLEND = 0.12;
const TEMPORAL_ALPHA = 0.32;
const MOTION_ALPHA = 0.8;
const MOTION_LOW = 0.02;
const MOTION_HIGH = 0.09;

export const DepthParams = d.struct({
  outputSize: d.vec2u,
  reset: d.u32,
});

export const rangeStabilityLayout = tgpu.bindGroupLayout({
  params: { uniform: DepthParams },
  frameRange: { storage: d.vec2f, access: 'readonly' },
  stableRange: { storage: d.vec2f, access: 'mutable' },
});

export const depthPrepareLayout = tgpu.bindGroupLayout({
  params: { uniform: DepthParams },
  disparity: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  stableRange: { storage: d.vec2f, access: 'readonly' },
  history: { storage: d.arrayOf(d.f32), access: 'mutable' },
});

export const colorizeLayout = tgpu.bindGroupLayout({
  time: { uniform: d.f32 },
  params: { uniform: DepthParams },
  depth: { storage: d.arrayOf(d.f32), access: 'readonly' },
  color: { storageTexture: d.textureStorage2d('rgba8unorm', 'write-only') },
});

export const presentLayout = tgpu.bindGroupLayout({
  color: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
});

export const stabilizeRangeKernel = tgpu.computeFn({ workgroupSize: [1] })(() => {
  'use gpu';
  const low = rangeStabilityLayout.$.frameRange.x;
  const high = std.max(rangeStabilityLayout.$.frameRange.y, low + 0.001);
  if (rangeStabilityLayout.$.params.reset !== 0) {
    rangeStabilityLayout.$.stableRange = d.vec2f(low, high);
    return;
  }

  const previousLow = rangeStabilityLayout.$.stableRange.x;
  const previousHigh = rangeStabilityLayout.$.stableRange.y;
  rangeStabilityLayout.$.stableRange = d.vec2f(
    std.mix(previousLow, low, RANGE_BLEND),
    std.mix(previousHigh, high, RANGE_BLEND),
  );
});

export const depthPrepareKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const width = depthPrepareLayout.$.params.outputSize.x;
  const index = gid.x;
  if (index >= width * depthPrepareLayout.$.params.outputSize.y) {
    return;
  }

  const low = depthPrepareLayout.$.stableRange.x;
  const span = std.max(depthPrepareLayout.$.stableRange.y - low, 0.001);
  const disparity = depthPrepareLayout.$.disparity[index].x;
  let normalized = d.f32(0);
  if (disparity === disparity) {
    normalized = std.saturate((disparity - low) / span);
  }

  let filtered = d.f32(normalized);
  if (depthPrepareLayout.$.params.reset === 0) {
    const previous = depthPrepareLayout.$.history[index];
    const motion = std.smoothstep(MOTION_LOW, MOTION_HIGH, std.abs(normalized - previous));
    filtered = std.mix(previous, normalized, std.mix(TEMPORAL_ALPHA, MOTION_ALPHA, motion));
  }

  depthPrepareLayout.$.history[index] = filtered;
});

function depthRamp(value: number): d.v3f {
  'use gpu';
  const cold = d.vec3f(0.03, 0.02, 0.12) * 5;
  const middle = d.vec3f(0.11, 0.45, 0.94);
  const warm = d.vec3f(0.85, 0.36, 0.96);
  const hot = d.vec3f(0.97, 0.8, 0.7);
  if (value < 0.4) {
    return std.mix(cold, middle, value / 0.4);
  }
  if (value < 0.75) {
    return std.mix(middle, warm, (value - 0.4) / 0.35);
  }
  return std.mix(warm, hot, (value - 0.75) / 0.25);
}

/** Maps the filtered depth field into a display-ready color texture */
export const colorizeKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [COLORIZE_WORKGROUP_SIZE, COLORIZE_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const size = d.vec2i(colorizeLayout.$.params.outputSize);
  const coord = d.vec2i(gid.xy);
  if (coord.x >= size.x || coord.y >= size.y) {
    return;
  }

  const uv = d.vec2f(gid.xy) / d.vec2f(size);

  const index = d.u32(coord.y) * d.u32(size.x) + d.u32(coord.x);
  const depth = colorizeLayout.$.depth[index];
  const rings = std.sin((depth + uv.x) * 200 + colorizeLayout.$.time * Math.PI * 2);

  let sobel = d.f32(0);
  for (let xi = d.i32(-1); xi <= 1; xi++) {
    const offIndex = d.u32(coord.y) * d.u32(size.x) + d.u32(coord.x + xi);
    sobel += colorizeLayout.$.depth[offIndex] * xi;
  }
  for (let yi = d.i32(-1); yi <= 1; yi++) {
    const offIndex = d.u32(coord.y + yi) * d.u32(size.x) + d.u32(coord.x);
    sobel += colorizeLayout.$.depth[offIndex] * yi;
  }

  const edge = std.abs(sobel * 10);

  std.textureStore(
    colorizeLayout.$.color,
    d.vec2u(gid.xy),
    d.vec4f(std.mix(depthRamp(std.saturate(depth)) * rings, d.vec3f(1), std.saturate(edge)), 1),
  );
});

export const presentFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  return std.textureSample(presentLayout.$.color, presentLayout.$.sampler, uv);
});
