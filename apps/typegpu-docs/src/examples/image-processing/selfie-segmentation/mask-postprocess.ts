import tgpu, { d, std } from 'typegpu';
import type { TgpuBindGroup, TgpuComputePipeline, TgpuRoot } from 'typegpu';
import { MODEL_HEIGHT, MODEL_WIDTH } from './inference.ts';
import { WORKGROUP_SIZE, type Vec4Buffer } from './kernels.ts';

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
  raw: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  temporal: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

const blurLayout = tgpu.bindGroupLayout({
  src: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  dst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

const maskValue = (alpha: number) => {
  'use gpu';
  return d.vec4f(alpha, 0, 0, 0);
};

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
  return blurLayout.$.src[y * MODEL_WIDTH + x].x;
};

const rawAt = (x: number, y: number) => {
  'use gpu';
  return temporalLayout.$.raw[y * MODEL_WIDTH + x].x;
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

  const raw = temporalLayout.$.raw[i].x;
  if (temporalLayout.$.params.initialized === 0) {
    temporalLayout.$.temporal[i] = maskValue(raw);
    return;
  }

  const previous = temporalLayout.$.temporal[i].x;
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
  temporalLayout.$.temporal[i] = maskValue(filtered);
});

export const softBlurKernel = tgpu.computeFn({
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

  blurLayout.$.dst[i] = maskValue(alpha);
});

export class MaskPostProcessor {
  readonly outputBuffer: Vec4Buffer;

  private readonly paramsBuffer;
  private readonly temporalBuffer: Vec4Buffer;
  private readonly workgroups = Math.ceil(TOTAL_PIXELS / WORKGROUP_SIZE);
  private readonly temporalPipeline: TgpuComputePipeline;
  private readonly blurPipeline: TgpuComputePipeline;
  private readonly temporalBindGroup: TgpuBindGroup;
  private readonly blurBindGroup: TgpuBindGroup;
  private initialized = false;

  constructor(root: TgpuRoot, rawMask: Vec4Buffer) {
    this.paramsBuffer = root.createBuffer(postProcessParams, { initialized: 0 }).$usage('uniform');
    this.temporalBuffer = createVec4Buffer(root);
    this.outputBuffer = createVec4Buffer(root);
    this.temporalPipeline = root.createComputePipeline({ compute: temporalAccumulatorKernel });
    this.blurPipeline = root.createComputePipeline({ compute: softBlurKernel });
    this.temporalBindGroup = root.createBindGroup(temporalLayout, {
      params: this.paramsBuffer,
      raw: rawMask,
      temporal: this.temporalBuffer,
    });
    this.blurBindGroup = root.createBindGroup(blurLayout, {
      src: this.temporalBuffer,
      dst: this.outputBuffer,
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
}

function createVec4Buffer(root: TgpuRoot): Vec4Buffer {
  return root.createBuffer(d.arrayOf(d.vec4f, TOTAL_PIXELS)).$usage('storage') as Vec4Buffer;
}
