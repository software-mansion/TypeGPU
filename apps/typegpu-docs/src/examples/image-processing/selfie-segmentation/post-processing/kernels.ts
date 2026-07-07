import { tgpu, d, std } from 'typegpu';
import { initialFrameCropParams } from '../frame.ts';

const MODEL_WIDTH = 256;
const MODEL_HEIGHT = 256;
const MODEL_COORD_MASK = MODEL_WIDTH - 1;
const MODEL_COORD_SHIFT = 8;

export const MODEL_PIXELS = MODEL_WIDTH * MODEL_HEIGHT;
export const POST_PROCESS_WORKGROUP_SIZE = 64;
export const POST_PROCESS_WORKGROUPS = Math.ceil(MODEL_PIXELS / POST_PROCESS_WORKGROUP_SIZE);
export const UPSAMPLE_WORKGROUP_SIZE = 16;

const MODEL_SIZE = d.vec2f(MODEL_WIDTH, MODEL_HEIGHT);
const MAX_MASK_COORD = d.vec2i(MODEL_WIDTH - 1, MODEL_HEIGHT - 1);

const PROBABILITY_EPSILON = 1e-4;

const TEMPORAL_ALPHA_MIN = 0.08;
const TEMPORAL_ALPHA_MAX = 0.85;
const CERTAINTY_EXPONENT = 1.5;
const AGREEMENT_LOW = 0.05;
const AGREEMENT_HIGH = 0.18;
const BACKGROUND_FAST_ALPHA = 0.75;

const CORE_SEED_LOW = 0.75;
const CORE_SEED_HIGH = 0.9;
const CORE_RADIUS = 6;
const CORE_RADIUS_F = 6;
const CORE_SIGMA = 0.42;
const OUTSIDE_CORE_ATTENUATION = 0.2;
const UNCERTAIN_LOW = 0.15;
const UNCERTAIN_HIGH = 0.85;

const UPSAMPLE_BAND_LOW = 0.05;
const UPSAMPLE_BAND_HIGH = 0.95;
const UPSAMPLE_RADIUS = 2;
const UPSAMPLE_SPATIAL_SIGMA = 1.6;
const UPSAMPLE_COLOR_SIGMA = 0.12;

export const PostProcessParams = d.struct({
  initialized: d.u32,
});

export const UpsampleParams = d.struct({
  sourceSize: d.vec2u,
  cropOrigin: d.vec2f,
  cropSize: d.vec2f,
  uvTransform: d.mat2x2f,
  edgeAware: d.u32,
});

export const initialUpsampleParams = {
  ...initialFrameCropParams,
  edgeAware: 0,
};

export const temporalLayout = tgpu.bindGroupLayout({
  params: { uniform: PostProcessParams },
  raw: { storage: d.arrayOf(d.f32), access: 'readonly' },
  historyLogits: { storage: d.arrayOf(d.f32), access: 'mutable' },
  filtered: { storage: d.arrayOf(d.f32), access: 'mutable' },
});

export const priorLayout = tgpu.bindGroupLayout({
  src: { storage: d.arrayOf(d.f32), access: 'readonly' },
  dst: { storage: d.arrayOf(d.f32), access: 'mutable' },
});

export const upsampleParamsLayout = tgpu.bindGroupLayout({
  params: { uniform: UpsampleParams },
});

export const upsampleFrameLayout = tgpu.bindGroupLayout({
  frame: { externalTexture: d.textureExternal() },
});

export const upsampleSamplerLayout = tgpu.bindGroupLayout({
  sampler: { sampler: 'filtering' },
});

export const upsampleMaskLayout = tgpu.bindGroupLayout({
  src: { storage: d.arrayOf(d.f32), access: 'readonly' },
  output: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
});

const maskCoord = (i: number) => {
  'use gpu';
  return d.vec2u(i & MODEL_COORD_MASK, std.bitShiftRight(i, MODEL_COORD_SHIFT));
};

const maskIndex = (coord: d.v2i) => {
  'use gpu';
  const clamped = std.clamp(coord, d.vec2i(0), MAX_MASK_COORD);
  return d.u32(clamped.y) * MODEL_WIDTH + d.u32(clamped.x);
};

const prevCoord = (value: number) => {
  'use gpu';
  if (value === 0) {
    return 0;
  }
  return value - 1;
};

const nextCoord = (value: number, maxValue: number) => {
  'use gpu';
  return std.min(value + 1, d.u32(maxValue));
};

const clampProbability = (p: number) => {
  'use gpu';
  return std.clamp(p, PROBABILITY_EPSILON, 1 - PROBABILITY_EPSILON);
};

const logitProbability = (p: number) => {
  'use gpu';
  const clamped = clampProbability(p);
  return std.log(clamped / (1 - clamped));
};

const sigmoidLogit = (z: number) => {
  'use gpu';
  return 1 / (1 + std.exp(0 - z));
};

const rawAt = (x: number, y: number) => {
  'use gpu';
  return clampProbability(temporalLayout.$.raw[y * MODEL_WIDTH + x]);
};

const priorSourceAt = (coord: d.v2i) => {
  'use gpu';
  return clampProbability(priorLayout.$.src[maskIndex(coord)]);
};

const upsampleSourceAt = (coord: d.v2i) => {
  'use gpu';
  return clampProbability(upsampleMaskLayout.$.src[maskIndex(coord)]);
};

const modelUvAt = (coord: d.v2i) => {
  'use gpu';
  return (d.vec2f(std.clamp(coord, d.vec2i(0), MAX_MASK_COORD)) + 0.5) / MODEL_SIZE;
};

const gaussianWeight = (distanceSquared: number, sigma: number) => {
  'use gpu';
  return std.exp((0 - distanceSquared) / (2 * sigma * sigma));
};

const centerPrior = (uv: d.v2f) => {
  'use gpu';
  const centered = (uv - d.vec2f(0.5)) / CORE_SIGMA;
  return std.exp((0 - std.dot(centered, centered)) * 0.5);
};

const uncertaintyBand = (p: number) => {
  'use gpu';
  return (
    std.smoothstep(UNCERTAIN_LOW, UNCERTAIN_LOW + 0.1, p) *
    (1 - std.smoothstep(UNCERTAIN_HIGH - 0.1, UNCERTAIN_HIGH, p))
  );
};

const cameraUvFromScreenUv = (uv: d.v2f) => {
  'use gpu';
  const cropUv = d.vec2f(1 - uv.x, uv.y);
  const sourcePixel =
    upsampleParamsLayout.$.params.cropOrigin + cropUv * upsampleParamsLayout.$.params.cropSize;
  const sourceUv = sourcePixel / d.vec2f(upsampleParamsLayout.$.params.sourceSize);
  return upsampleParamsLayout.$.params.uvTransform * (sourceUv - 0.5) + 0.5;
};

const cameraColorAtScreenUv = (uv: d.v2f) => {
  'use gpu';
  return std.textureSampleBaseClampToEdge(
    upsampleFrameLayout.$.frame,
    upsampleSamplerLayout.$.sampler,
    cameraUvFromScreenUv(uv),
  ).rgb;
};

const sampleMaskBilinear = (uv: d.v2f) => {
  'use gpu';
  const pixel = uv * MODEL_SIZE - 0.5;
  const base = d.vec2i(std.floor(pixel));
  const frac = pixel - d.vec2f(base);

  const topLeft = upsampleSourceAt(base);
  const topRight = upsampleSourceAt(base + d.vec2i(1, 0));
  const bottomLeft = upsampleSourceAt(base + d.vec2i(0, 1));
  const bottomRight = upsampleSourceAt(base + d.vec2i(1, 1));

  const top = std.mix(topLeft, topRight, frac.x);
  const bottom = std.mix(bottomLeft, bottomRight, frac.x);
  return std.mix(top, bottom, frac.y);
};

const storeOutputMask = (coord: d.v2u, mask: number) => {
  'use gpu';
  std.textureStore(upsampleMaskLayout.$.output, coord, d.vec4f(mask, 0, 0, 1));
};

export const temporalAccumulatorKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [POST_PROCESS_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const i = gid.x;
  if (i >= MODEL_PIXELS) {
    return;
  }

  const raw = clampProbability(temporalLayout.$.raw[i]);
  const rawLogit = logitProbability(raw);
  if (temporalLayout.$.params.initialized === 0) {
    temporalLayout.$.historyLogits[i] = rawLogit;
    temporalLayout.$.filtered[i] = raw;
    return;
  }

  const coord = maskCoord(i);
  const left = prevCoord(coord.x);
  const right = nextCoord(coord.x, MODEL_WIDTH - 1);
  const top = prevCoord(coord.y);
  const bottom = nextCoord(coord.y, MODEL_HEIGHT - 1);
  const horizontal = rawAt(left, coord.y) + rawAt(right, coord.y);
  const vertical = rawAt(coord.x, top) + rawAt(coord.x, bottom);
  const localMean = (raw + horizontal + vertical) * 0.2;

  const certainty = std.abs(raw - 0.5) * 2;
  const certaintyBlend = std.mix(
    TEMPORAL_ALPHA_MIN,
    TEMPORAL_ALPHA_MAX,
    std.pow(certainty, CERTAINTY_EXPONENT),
  );
  const agreement = 1 - std.smoothstep(AGREEMENT_LOW, AGREEMENT_HIGH, std.abs(raw - localMean));
  const supportScale = std.mix(0.55, 1, agreement);
  const confidentBackground = 1 - std.smoothstep(0.08, 0.2, raw);
  const alpha = std.max(certaintyBlend * supportScale, confidentBackground * BACKGROUND_FAST_ALPHA);
  const filteredLogit = std.mix(temporalLayout.$.historyLogits[i], rawLogit, alpha);

  temporalLayout.$.historyLogits[i] = filteredLogit;
  temporalLayout.$.filtered[i] = sigmoidLogit(filteredLogit);
});

export const personCorePriorKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [POST_PROCESS_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const i = gid.x;
  if (i >= MODEL_PIXELS) {
    return;
  }

  const coord = d.vec2i(maskCoord(i));
  const probability = clampProbability(priorLayout.$.src[i]);
  const uv = (d.vec2f(coord) + 0.5) / MODEL_SIZE;
  const centerWeight = centerPrior(uv);
  let support = d.f32(0);
  let totalWeight = d.f32(0);

  for (let dy = -CORE_RADIUS; dy <= CORE_RADIUS; dy++) {
    for (let dx = -CORE_RADIUS; dx <= CORE_RADIUS; dx++) {
      const offset = d.vec2i(dx, dy);
      const dist2 = d.f32(dx * dx + dy * dy);
      if (dist2 <= CORE_RADIUS_F * CORE_RADIUS_F) {
        const sampleCoord = coord + offset;
        const sampleValue = priorSourceAt(sampleCoord);
        const sampleUv = modelUvAt(sampleCoord);
        const seed = std.smoothstep(CORE_SEED_LOW, CORE_SEED_HIGH, sampleValue);
        const spatialWeight = gaussianWeight(dist2, CORE_RADIUS_F);
        const weightedSeed = seed * std.mix(0.4, 1, centerPrior(sampleUv));
        support += weightedSeed * spatialWeight;
        totalWeight += spatialWeight;
      }
    }
  }

  const normalizedSupport = support / std.max(totalWeight, 1e-4);
  const protection = normalizedSupport * std.mix(0.45, 1, centerWeight);
  const outside = 1 - std.smoothstep(0.035, 0.12, protection);
  const uncertaintyProtection = uncertaintyBand(probability) * 0.35;
  const attenuation = std.mix(1, OUTSIDE_CORE_ATTENUATION, outside * (1 - uncertaintyProtection));
  priorLayout.$.dst[i] = probability * attenuation;
});

export const upsampleToTextureKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [UPSAMPLE_WORKGROUP_SIZE, UPSAMPLE_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const outputDims = std.textureDimensions(upsampleMaskLayout.$.output);
  if (gid.x >= outputDims.x || gid.y >= outputDims.y) {
    return;
  }

  const outputCoord = d.vec2u(gid.xy);
  const uv = (d.vec2f(outputCoord) + 0.5) / d.vec2f(outputDims);
  const baseMask = sampleMaskBilinear(uv);
  if (
    upsampleParamsLayout.$.params.edgeAware === 0 ||
    baseMask <= UPSAMPLE_BAND_LOW ||
    baseMask >= UPSAMPLE_BAND_HIGH
  ) {
    storeOutputMask(outputCoord, baseMask);
    return;
  }

  const centerColor = cameraColorAtScreenUv(uv);
  const modelPixel = uv * MODEL_SIZE - 0.5;
  const baseCoord = d.vec2i(std.floor(modelPixel));
  let weightedMask = d.f32(0);
  let totalWeight = d.f32(0);

  for (let dy = -UPSAMPLE_RADIUS; dy <= UPSAMPLE_RADIUS; dy++) {
    for (let dx = -UPSAMPLE_RADIUS; dx <= UPSAMPLE_RADIUS; dx++) {
      const sampleCoord = baseCoord + d.vec2i(dx, dy);
      const clampedCoord = std.clamp(sampleCoord, d.vec2i(0), MAX_MASK_COORD);
      const sampleUv = modelUvAt(clampedCoord);
      const sampleColor = cameraColorAtScreenUv(sampleUv);
      const colorDelta = centerColor - sampleColor;
      const colorDist2 = std.dot(colorDelta, colorDelta);
      const spatialDist2 = d.f32(dx * dx + dy * dy);
      const spatialWeight = gaussianWeight(spatialDist2, UPSAMPLE_SPATIAL_SIGMA);
      const colorWeight = gaussianWeight(colorDist2, UPSAMPLE_COLOR_SIGMA);
      const weight = spatialWeight * colorWeight;
      weightedMask += upsampleSourceAt(clampedCoord) * weight;
      totalWeight += weight;
    }
  }

  const refinedMask = weightedMask / std.max(totalWeight, 1e-4);
  storeOutputMask(outputCoord, refinedMask);
});
