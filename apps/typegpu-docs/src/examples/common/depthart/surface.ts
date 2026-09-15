import { d, std, tgpu } from 'typegpu';

export const DEPTH_WORKGROUP_SIZE = 64;
export const SURFACE_WORKGROUP_SIZE = 8;
const RING_OFFSETS = [-1, 0, 1] as const;

const RANGE_BLEND = 0.12;
const TEMPORAL_ALPHA = 0.32;
const MOTION_ALPHA = 0.8;
const MOTION_LOW = 0.02;
const MOTION_HIGH = 0.09;

const GRADIENT_RADIUS = 7;
const GRADIENT_BACK = -GRADIENT_RADIUS;
const GRADIENT_LIMIT = 0.009;
const GRADIENT_NOISE = 0.0003;
const GRADIENT_NOISE_ENERGY = GRADIENT_NOISE ** 2;
const OCCLUSION_RADII = [3, 9] as const;
const OCCLUSION_TAPS = OCCLUSION_RADII.length * (RING_OFFSETS.length ** 2 - 1);
const OCCLUSION_SCALE = 0.07;
const OCCLUSION_RANGE = 0.25;
const OCCLUSION_FLOOR = 0.012;

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

export const surfaceLayout = tgpu.bindGroupLayout({
  params: { uniform: DepthParams },
  depth: { storage: d.arrayOf(d.f32), access: 'readonly' },
  surface: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
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

function texelIndex(coord: d.v2i, size: d.v2i): number {
  'use gpu';
  const clamped = std.clamp(coord, d.vec2i(0), size - 1);
  return d.u32(clamped.y) * d.u32(size.x) + d.u32(clamped.x);
}

function depthTexelAt(coord: d.v2i, size: d.v2i): number {
  'use gpu';
  return surfaceLayout.$.depth[texelIndex(coord, size)];
}

function gentlerDelta(backward: number, forward: number): number {
  'use gpu';
  const back = std.abs(backward);
  const front = std.abs(forward);
  return (backward * front + forward * back) / std.max(back + front, 0.000000001);
}

function surfaceSlope(gradient: d.v2f): d.v2f {
  'use gpu';
  const steepness = std.max(std.length(gradient), 0.000000001);
  const shrunk = std.sqrt(std.max(steepness * steepness - GRADIENT_NOISE_ENERGY, 0));
  const ceiling = GRADIENT_LIMIT * std.tanh(shrunk / GRADIENT_LIMIT);
  return gradient * (ceiling / steepness);
}

/** Compile out occlusion taps for consumers that only need slopes and depth. */
export const surfaceOcclusionSlot = tgpu.slot(true);

/** Derives the surface slope and a height-field occlusion term from the depth field */
export const surfaceKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [SURFACE_WORKGROUP_SIZE, SURFACE_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const size = d.vec2i(surfaceLayout.$.params.outputSize);
  const coord = d.vec2i(gid.xy);
  if (coord.x >= size.x || coord.y >= size.y) {
    return;
  }

  const center = depthTexelAt(coord, size);
  const left = depthTexelAt(coord + d.vec2i(GRADIENT_BACK, 0), size);
  const right = depthTexelAt(coord + d.vec2i(GRADIENT_RADIUS, 0), size);
  const up = depthTexelAt(coord + d.vec2i(0, GRADIENT_BACK), size);
  const down = depthTexelAt(coord + d.vec2i(0, GRADIENT_RADIUS), size);
  const gradient = surfaceSlope(
    d.vec2f(gentlerDelta(center - left, right - center), gentlerDelta(center - up, down - center)) /
      d.f32(GRADIENT_RADIUS),
  );

  let occlusion = d.f32(0);
  if (surfaceOcclusionSlot.$) {
    for (const radius of tgpu.unroll(OCCLUSION_RADII)) {
      for (const stepY of tgpu.unroll(RING_OFFSETS)) {
        for (const stepX of tgpu.unroll(RING_OFFSETS)) {
          if (stepX !== 0 || stepY !== 0) {
            const neighbor = depthTexelAt(coord + d.vec2i(stepX * radius, stepY * radius), size);
            const difference = neighbor - center;
            const contact = 1 - std.saturate(std.abs(difference) / OCCLUSION_RANGE);
            const cleared = std.max(difference - OCCLUSION_FLOOR, 0);
            occlusion += std.saturate(cleared / OCCLUSION_SCALE) * contact;
          }
        }
      }
    }
  }

  std.textureStore(
    surfaceLayout.$.surface,
    d.vec2u(gid.xy),
    d.vec4f(gradient, 1 - std.saturate(occlusion / d.f32(OCCLUSION_TAPS)), center),
  );
});
