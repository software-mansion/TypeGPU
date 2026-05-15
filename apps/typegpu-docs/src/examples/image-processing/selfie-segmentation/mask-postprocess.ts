import tgpu, { d, std } from 'typegpu';
import type { SampledFlag, StorageFlag, TgpuRoot, TgpuTexture, TgpuTextureView } from 'typegpu';
import { MODEL_HEIGHT, MODEL_WIDTH } from './inference.ts';
import { type KernelHandle, type MaskBuffer, WORKGROUP_SIZE } from './kernels.ts';
import type { VideoFrameCrop } from './video-preprocess.ts';

export const maskPostProcessProfiles = ['raw', 'temporal', 'balanced'] as const;
export type MaskPostProcessProfile = (typeof maskPostProcessProfiles)[number];

export interface MaskOutputSize {
  width: number;
  height: number;
}

type MaskTexture = TgpuTexture<{
  size: readonly [number, number];
  format: 'rgba16float';
}> &
  StorageFlag &
  SampledFlag;

type SampledMaskView = TgpuTextureView<d.WgslTexture2d<d.F32>>;
type StorageMaskView = TgpuTextureView<d.WgslStorageTexture2d<'rgba16float', 'write-only'>>;

interface MaskTextureViews {
  texture: MaskTexture;
  sampleView: SampledMaskView;
  storageView: StorageMaskView;
}

interface KernelHandle2d {
  pipeline: KernelHandle['pipeline'];
  workgroupsX: number;
  workgroupsY: number;
}

const TOTAL_PIXELS = MODEL_WIDTH * MODEL_HEIGHT;
const WORKGROUPS = Math.ceil(TOTAL_PIXELS / WORKGROUP_SIZE);
const MODEL_SIZE = d.vec2f(MODEL_WIDTH, MODEL_HEIGHT);
const MAX_MASK_COORD = d.vec2i(MODEL_WIDTH - 1, MODEL_HEIGHT - 1);
const EPSILON = 1e-4;
const ALPHA_MIN = 0.08;
const ALPHA_MAX = 0.85;
const CERTAINTY_EXPONENT = 1.5;
const AGREEMENT_LOW = 0.05;
const AGREEMENT_HIGH = 0.18;
const BACKGROUND_FAST_ALPHA = 0.75;
const CORE_SEED_LOW = 0.75;
const CORE_SEED_HIGH = 0.9;
const CORE_RADIUS = 6;
const CORE_RADIUS_F = 6;
const CORE_SIGMA = 0.42;
const BETA_OUT = 0.2;
const UNCERTAIN_LOW = 0.15;
const UNCERTAIN_HIGH = 0.85;
const UPSAMPLE_BAND_LOW = 0.05;
const UPSAMPLE_BAND_HIGH = 0.95;
const UPSAMPLE_RADIUS = 2;
const UPSAMPLE_SPATIAL_SIGMA = 1.6;
const UPSAMPLE_COLOR_SIGMA = 0.12;

const postProcessParams = d.struct({
  initialized: d.u32,
});

const upsampleParams = d.struct({
  sourceSize: d.vec2u,
  cropOrigin: d.vec2f,
  cropSize: d.vec2f,
  edgeAware: d.u32,
});

const temporalLayout = tgpu.bindGroupLayout({
  params: { uniform: postProcessParams },
  raw: { storage: d.arrayOf(d.f32), access: 'readonly' },
  historyLogits: { storage: d.arrayOf(d.f32), access: 'mutable' },
  filtered: { storage: d.arrayOf(d.f32), access: 'mutable' },
});

const priorLayout = tgpu.bindGroupLayout({
  src: { storage: d.arrayOf(d.f32), access: 'readonly' },
  dst: { storage: d.arrayOf(d.f32), access: 'mutable' },
});

const upsampleLayout = tgpu.bindGroupLayout({
  params: { uniform: upsampleParams },
  frame: { externalTexture: d.textureExternal() },
  sampler: { sampler: 'filtering' },
  src: { storage: d.arrayOf(d.f32), access: 'readonly' },
  output: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
});

const maskCoord = (i: number) => {
  'use gpu';
  return d.vec2u(i & 255, std.bitShiftRight(i, 8));
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

const nextCoord = (value: number) => {
  'use gpu';
  return std.min(value + 1, 255);
};

const clampProbability = (p: number) => {
  'use gpu';
  return std.clamp(p, EPSILON, 1 - EPSILON);
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
  return clampProbability(upsampleLayout.$.src[maskIndex(coord)]);
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
    upsampleLayout.$.params.cropOrigin + cropUv * upsampleLayout.$.params.cropSize;
  return sourcePixel / d.vec2f(upsampleLayout.$.params.sourceSize);
};

const cameraColorAtScreenUv = (uv: d.v2f) => {
  'use gpu';
  return std.textureSampleBaseClampToEdge(
    upsampleLayout.$.frame,
    upsampleLayout.$.sampler,
    cameraUvFromScreenUv(uv),
  ).rgb;
};

const sampleMaskBilinear = (uv: d.v2f) => {
  'use gpu';
  const pixel = uv * MODEL_SIZE - 0.5;
  const base = d.vec2i(std.floor(pixel));
  const frac = pixel - d.vec2f(base);
  const a = upsampleSourceAt(base);
  const b = upsampleSourceAt(base + d.vec2i(1, 0));
  const c = upsampleSourceAt(base + d.vec2i(0, 1));
  const e = upsampleSourceAt(base + d.vec2i(1, 1));
  return std.mix(std.mix(a, b, frac.x), std.mix(c, e, frac.x), frac.y);
};

export const temporalAccumulatorKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const i = gid.x;
  if (i >= TOTAL_PIXELS) {
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
  const right = nextCoord(coord.x);
  const top = prevCoord(coord.y);
  const bottom = nextCoord(coord.y);
  const localMean =
    (raw +
      rawAt(left, coord.y) +
      rawAt(right, coord.y) +
      rawAt(coord.x, top) +
      rawAt(coord.x, bottom)) *
    0.2;

  const certainty = std.abs(raw - 0.5) * 2;
  const certaintyBlend = std.mix(ALPHA_MIN, ALPHA_MAX, std.pow(certainty, CERTAINTY_EXPONENT));
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
  workgroupSize: [WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const i = gid.x;
  if (i >= TOTAL_PIXELS) {
    return;
  }

  const coord = d.vec2i(maskCoord(i));
  const p = clampProbability(priorLayout.$.src[i]);
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
        const sampleUv =
          (d.vec2f(std.clamp(sampleCoord, d.vec2i(0), MAX_MASK_COORD)) + 0.5) / MODEL_SIZE;
        const seed = std.smoothstep(CORE_SEED_LOW, CORE_SEED_HIGH, sampleValue);
        const spatialWeight = std.exp((0 - dist2) / (2 * CORE_RADIUS_F * CORE_RADIUS_F));
        const weightedSeed = seed * std.mix(0.4, 1, centerPrior(sampleUv));
        support += weightedSeed * spatialWeight;
        totalWeight += spatialWeight;
      }
    }
  }

  const normalizedSupport = support / std.max(totalWeight, 1e-4);
  const protection = normalizedSupport * std.mix(0.45, 1, centerWeight);
  const outside = 1 - std.smoothstep(0.035, 0.12, protection);
  const uncertaintyProtection = uncertaintyBand(p) * 0.35;
  const attenuation = std.mix(1, BETA_OUT, outside * (1 - uncertaintyProtection));
  priorLayout.$.dst[i] = p * attenuation;
});

export const upsampleToTextureKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [16, 16],
})(({ gid }) => {
  'use gpu';
  const outputDims = std.textureDimensions(upsampleLayout.$.output);
  if (gid.x >= outputDims.x || gid.y >= outputDims.y) {
    return;
  }

  const outputCoord = d.vec2u(gid.xy);
  const uv = (d.vec2f(outputCoord) + 0.5) / d.vec2f(outputDims);
  const baseMask = sampleMaskBilinear(uv);
  if (
    upsampleLayout.$.params.edgeAware === 0 ||
    baseMask <= UPSAMPLE_BAND_LOW ||
    baseMask >= UPSAMPLE_BAND_HIGH
  ) {
    std.textureStore(upsampleLayout.$.output, outputCoord, d.vec4f(baseMask, 0, 0, 1));
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
      const sampleUv = (d.vec2f(clampedCoord) + 0.5) / MODEL_SIZE;
      const sampleColor = cameraColorAtScreenUv(sampleUv);
      const colorDelta = centerColor - sampleColor;
      const colorDist2 = std.dot(colorDelta, colorDelta);
      const spatialDist2 = d.f32(dx * dx + dy * dy);
      const spatialWeight = std.exp(
        (0 - spatialDist2) / (2 * UPSAMPLE_SPATIAL_SIGMA * UPSAMPLE_SPATIAL_SIGMA),
      );
      const colorWeight = std.exp(
        (0 - colorDist2) / (2 * UPSAMPLE_COLOR_SIGMA * UPSAMPLE_COLOR_SIGMA),
      );
      const weight = spatialWeight * colorWeight;
      weightedMask += upsampleSourceAt(clampedCoord) * weight;
      totalWeight += weight;
    }
  }

  const refinedMask = weightedMask / std.max(totalWeight, 1e-4);
  std.textureStore(upsampleLayout.$.output, outputCoord, d.vec4f(refinedMask, 0, 0, 1));
});

export class MaskPostProcessor {
  maskView: SampledMaskView;

  readonly #root: TgpuRoot;
  readonly #rawMask: MaskBuffer;
  readonly #paramsBuffer;
  readonly #upsampleParamsBuffer;
  readonly #sampler;
  readonly #temporalMask: MaskBuffer;
  readonly #priorMask: MaskBuffer;
  readonly #temporal: KernelHandle;
  readonly #prior: KernelHandle;
  readonly #upsample: KernelHandle2d;
  #maskTexture: MaskTexture;
  #maskStorageView: StorageMaskView;
  #outputWidth = 0;
  #outputHeight = 0;
  #initialized = false;

  constructor(root: TgpuRoot, rawMask: MaskBuffer) {
    const paramsBuffer = root.createBuffer(postProcessParams, { initialized: 0 }).$usage('uniform');
    const upsampleParamsBuffer = root
      .createBuffer(upsampleParams, {
        sourceSize: d.vec2u(1, 1),
        cropOrigin: d.vec2f(0),
        cropSize: d.vec2f(1),
        edgeAware: 0,
      })
      .$usage('uniform');
    const historyLogits = createMaskBuffer(root);
    const temporalMask = createMaskBuffer(root);
    const priorMask = createMaskBuffer(root);
    const mask = createMaskTexture(root, 1, 1);

    this.#root = root;
    this.#rawMask = rawMask;
    this.#paramsBuffer = paramsBuffer;
    this.#upsampleParamsBuffer = upsampleParamsBuffer;
    this.#sampler = root.createSampler({
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      magFilter: 'linear',
      minFilter: 'linear',
    });
    this.#temporalMask = temporalMask;
    this.#priorMask = priorMask;
    this.#maskTexture = mask.texture;
    this.maskView = mask.sampleView;
    this.#maskStorageView = mask.storageView;
    this.#temporal = {
      pipeline: root.createComputePipeline({ compute: temporalAccumulatorKernel }),
      bindGroup: root.createBindGroup(temporalLayout, {
        params: paramsBuffer,
        raw: rawMask,
        historyLogits,
        filtered: temporalMask,
      }),
      workgroups: WORKGROUPS,
    };
    this.#prior = {
      pipeline: root.createComputePipeline({ compute: personCorePriorKernel }),
      bindGroup: root.createBindGroup(priorLayout, {
        src: temporalMask,
        dst: priorMask,
      }),
      workgroups: WORKGROUPS,
    };
    this.#upsample = {
      pipeline: root.createComputePipeline({ compute: upsampleToTextureKernel }),
      workgroupsX: 1,
      workgroupsY: 1,
    };
  }

  reset(): void {
    this.#initialized = false;
  }

  encode(
    pass: GPUComputePassEncoder,
    externalTexture: GPUExternalTexture,
    crop: VideoFrameCrop,
    outputSize: MaskOutputSize,
    profile: MaskPostProcessProfile,
  ): void {
    this.#ensureOutputTexture(outputSize);

    let source = this.#rawMask;
    let edgeAware = 0;
    if (profile !== 'raw') {
      this.#paramsBuffer.write({ initialized: this.#initialized ? 1 : 0 });
      dispatch(pass, this.#temporal);
      source = this.#temporalMask;
      this.#initialized = true;
    }

    if (profile === 'balanced') {
      dispatch(pass, this.#prior);
      source = this.#priorMask;
      edgeAware = 1;
    }

    this.#upsampleParamsBuffer.write({
      sourceSize: d.vec2u(crop.sourceWidth, crop.sourceHeight),
      cropOrigin: d.vec2f(crop.x, crop.y),
      cropSize: d.vec2f(crop.width, crop.height),
      edgeAware,
    });
    this.#upsample.pipeline
      .with(pass)
      .with(
        this.#root.createBindGroup(upsampleLayout, {
          params: this.#upsampleParamsBuffer,
          frame: externalTexture,
          sampler: this.#sampler,
          src: source,
          output: this.#maskStorageView,
        }),
      )
      .dispatchWorkgroups(this.#upsample.workgroupsX, this.#upsample.workgroupsY);
  }

  #ensureOutputTexture({ width, height }: MaskOutputSize): void {
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));
    if (nextWidth === this.#outputWidth && nextHeight === this.#outputHeight) {
      return;
    }

    const mask = createMaskTexture(this.#root, nextWidth, nextHeight);
    this.#maskTexture.destroy();
    this.#maskTexture = mask.texture;
    this.maskView = mask.sampleView;
    this.#maskStorageView = mask.storageView;
    this.#outputWidth = nextWidth;
    this.#outputHeight = nextHeight;
    this.#upsample.workgroupsX = Math.ceil(nextWidth / 16);
    this.#upsample.workgroupsY = Math.ceil(nextHeight / 16);
  }
}

function dispatch(pass: GPUComputePassEncoder, handle: KernelHandle): void {
  handle.pipeline.with(pass).with(handle.bindGroup).dispatchWorkgroups(handle.workgroups);
}

function createMaskBuffer(root: TgpuRoot): MaskBuffer {
  return root.createBuffer(d.arrayOf(d.f32, TOTAL_PIXELS)).$usage('storage') as MaskBuffer;
}

function createMaskTexture(root: TgpuRoot, width: number, height: number): MaskTextureViews {
  const texture = root
    .createTexture({
      size: [width, height],
      format: 'rgba16float',
    })
    .$usage('storage', 'sampled') as MaskTexture;
  return {
    texture,
    sampleView: texture.createView(d.texture2d(d.f32)),
    storageView: texture.createView(d.textureStorage2d('rgba16float', 'write-only')),
  };
}
