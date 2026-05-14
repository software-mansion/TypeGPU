import tgpu, { d, std } from 'typegpu';
import type {
  SampledFlag,
  StorageFlag,
  TgpuBindGroup,
  TgpuComputePipeline,
  TgpuRoot,
  TgpuTexture,
  TgpuTextureView,
} from 'typegpu';
import { MODEL_HEIGHT, MODEL_WIDTH } from './inference.ts';
import { type MaskBuffer, WORKGROUP_SIZE } from './kernels.ts';

type MaskTexture = TgpuTexture<{
  size: readonly [typeof MODEL_WIDTH, typeof MODEL_HEIGHT];
  format: 'rgba8unorm';
}> &
  StorageFlag &
  SampledFlag;

type SampledMaskView = TgpuTextureView<d.WgslTexture2d<d.F32>>;
type StorageMaskView = TgpuTextureView<d.WgslStorageTexture2d<'rgba8unorm', 'write-only'>>;

const TOTAL_PIXELS = MODEL_WIDTH * MODEL_HEIGHT;
const MIN_BLEND = 0.08;
const MAX_BLEND = 1;
const CERTAINTY_LOW = 0.55;
const CERTAINTY_HIGH = 0.92;
const AGREEMENT_LOW = 0.07;
const AGREEMENT_HIGH = 0.2;
const MIN_SUPPORT_SCALE = 0.45;
const HIGH_CERTAINTY_SCALE = 0.75;
const HIGH_CERTAINTY_LOW = 0.86;
const MEMORY_STRENGTH = 0.7;
const MEMORY_CERTAINTY_LOW = 0.28;
const MEMORY_CERTAINTY_HIGH = 0.62;

const postProcessParams = d.struct({
  initialized: d.u32,
});

const temporalLayout = tgpu.bindGroupLayout({
  params: { uniform: postProcessParams },
  raw: { storage: d.arrayOf(d.f32), access: 'readonly' },
  temporal: { storage: d.arrayOf(d.f32), access: 'mutable' },
});

const blurToTextureLayout = tgpu.bindGroupLayout({
  src: { storage: d.arrayOf(d.f32), access: 'readonly' },
  output: { storageTexture: d.textureStorage2d('rgba8unorm', 'write-only') },
});

const rawToTextureLayout = tgpu.bindGroupLayout({
  raw: { storage: d.arrayOf(d.f32), access: 'readonly' },
  output: { storageTexture: d.textureStorage2d('rgba8unorm', 'write-only') },
});

const maskCoord = (i: number) => {
  'use gpu';
  return d.vec2u(i & 255, std.bitShiftRight(i, 8));
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

const maskAt = (x: number, y: number) => {
  'use gpu';
  return blurToTextureLayout.$.src[y * MODEL_WIDTH + x];
};

const rawAt = (x: number, y: number) => {
  'use gpu';
  return temporalLayout.$.raw[y * MODEL_WIDTH + x];
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

  const raw = temporalLayout.$.raw[i];
  if (temporalLayout.$.params.initialized === 0) {
    temporalLayout.$.temporal[i] = raw;
    return;
  }

  const previous = temporalLayout.$.temporal[i];
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
  const certaintyBlend = std.mix(
    MIN_BLEND,
    MAX_BLEND,
    std.smoothstep(CERTAINTY_LOW, CERTAINTY_HIGH, certainty),
  );
  const agreement = 1 - std.smoothstep(AGREEMENT_LOW, AGREEMENT_HIGH, std.abs(raw - localMean));
  const supportFloor = std.mix(
    MIN_SUPPORT_SCALE,
    HIGH_CERTAINTY_SCALE,
    std.smoothstep(HIGH_CERTAINTY_LOW, MAX_BLEND, certainty),
  );
  const supportScale = std.mix(supportFloor, MAX_BLEND, agreement);
  const blend = certaintyBlend * supportScale;
  const previousCertainty = std.abs(previous - 0.5) * 2;
  const memoryWeight =
    previousCertainty *
    (1 - std.smoothstep(MEMORY_CERTAINTY_LOW, MEMORY_CERTAINTY_HIGH, certainty)) *
    MEMORY_STRENGTH;
  const carriedRaw = std.clamp(raw + (previous - 0.5) * memoryWeight, 0, 1);
  const filtered = std.mix(previous, carriedRaw, blend);
  temporalLayout.$.temporal[i] = filtered;
});

export const softBlurToTextureKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const i = gid.x;
  if (i >= TOTAL_PIXELS) {
    return;
  }

  const coord = maskCoord(i);
  const left = prevCoord(coord.x);
  const right = nextCoord(coord.x);
  const top = prevCoord(coord.y);
  const bottom = nextCoord(coord.y);
  const alpha =
    maskAt(left, top) * 0.0625 +
    maskAt(coord.x, top) * 0.125 +
    maskAt(right, top) * 0.0625 +
    maskAt(left, coord.y) * 0.125 +
    maskAt(coord.x, coord.y) * 0.25 +
    maskAt(right, coord.y) * 0.125 +
    maskAt(left, bottom) * 0.0625 +
    maskAt(coord.x, bottom) * 0.125 +
    maskAt(right, bottom) * 0.0625;

  std.textureStore(blurToTextureLayout.$.output, coord, d.vec4f(alpha, alpha, alpha, 1));
});

export const rawMaskToTextureKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const i = gid.x;
  if (i >= TOTAL_PIXELS) {
    return;
  }

  const alpha = rawToTextureLayout.$.raw[i];
  std.textureStore(rawToTextureLayout.$.output, maskCoord(i), d.vec4f(alpha, alpha, alpha, 1));
});

export class MaskPostProcessor {
  readonly maskTexture: MaskTexture;
  readonly maskView: SampledMaskView;

  private readonly maskStorageView: StorageMaskView;
  private readonly paramsBuffer;
  private readonly temporalBuffer: MaskBuffer;
  private readonly workgroups = Math.ceil(TOTAL_PIXELS / WORKGROUP_SIZE);
  private readonly temporalPipeline: TgpuComputePipeline;
  private readonly blurPipeline: TgpuComputePipeline;
  private readonly rawToTexturePipeline: TgpuComputePipeline;
  private readonly temporalBindGroup: TgpuBindGroup;
  private readonly blurBindGroup: TgpuBindGroup;
  private readonly rawToTextureBindGroup: TgpuBindGroup;
  private initialized = false;

  constructor(root: TgpuRoot, rawMask: MaskBuffer) {
    this.paramsBuffer = root.createBuffer(postProcessParams, { initialized: 0 }).$usage('uniform');
    this.temporalBuffer = createMaskBuffer(root);
    this.maskTexture = root
      .createTexture({
        size: [MODEL_WIDTH, MODEL_HEIGHT],
        format: 'rgba8unorm',
      })
      .$usage('storage', 'sampled') as MaskTexture;
    this.maskView = this.maskTexture.createView(d.texture2d(d.f32));
    this.maskStorageView = this.maskTexture.createView(
      d.textureStorage2d('rgba8unorm', 'write-only'),
    );
    this.temporalPipeline = root.createComputePipeline({ compute: temporalAccumulatorKernel });
    this.blurPipeline = root.createComputePipeline({ compute: softBlurToTextureKernel });
    this.rawToTexturePipeline = root.createComputePipeline({ compute: rawMaskToTextureKernel });
    this.temporalBindGroup = root.createBindGroup(temporalLayout, {
      params: this.paramsBuffer,
      raw: rawMask,
      temporal: this.temporalBuffer,
    });
    this.blurBindGroup = root.createBindGroup(blurToTextureLayout, {
      src: this.temporalBuffer,
      output: this.maskStorageView,
    });
    this.rawToTextureBindGroup = root.createBindGroup(rawToTextureLayout, {
      raw: rawMask,
      output: this.maskStorageView,
    });
  }

  reset(): void {
    this.initialized = false;
  }

  encode(pass: GPUComputePassEncoder): void {
    this.paramsBuffer.write({ initialized: this.initialized ? 1 : 0 });
    this.temporalPipeline
      .with(pass)
      .with(this.temporalBindGroup)
      .dispatchWorkgroups(this.workgroups);
    this.blurPipeline.with(pass).with(this.blurBindGroup).dispatchWorkgroups(this.workgroups);
    this.initialized = true;
  }

  encodeRaw(pass: GPUComputePassEncoder): void {
    this.rawToTexturePipeline
      .with(pass)
      .with(this.rawToTextureBindGroup)
      .dispatchWorkgroups(this.workgroups);
  }
}

function createMaskBuffer(root: TgpuRoot): MaskBuffer {
  return root.createBuffer(d.arrayOf(d.f32, TOTAL_PIXELS)).$usage('storage') as MaskBuffer;
}
