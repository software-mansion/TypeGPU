import { d, std, tgpu } from 'typegpu';
import type {
  StorageFlag,
  TgpuBuffer,
  TgpuComputePass,
  TgpuComputePipeline,
  TgpuRoot,
  TgpuSampler,
  TgpuUniform,
} from 'typegpu';

const WORKGROUP_SIZE = 64;
const CUBIC_A = -0.75;
const CUBIC_TAPS = [-1, 0, 1, 2] as const;

export type Hwc4Buffer = TgpuBuffer<d.WgslArray<d.Vec4f>> & StorageFlag;

export interface DepthFrameCrop {
  readonly sourceSize: readonly [width: number, height: number];
  readonly cropOrigin: readonly [x: number, y: number];
  readonly cropSize: readonly [width: number, height: number];
  readonly mirrorX?: boolean;
  readonly uvTransform?: d.m2x2f;
  /** Derive a centered square crop from the GPU external texture dimensions */
  readonly gpuSquareCrop?: boolean;
  /** Whether the UV transform exchanges the texture's width and height axes */
  readonly swapAxes?: boolean;
}

const FrameParams = d.struct({
  sourceSize: d.vec2f,
  cropOrigin: d.vec2f,
  cropSize: d.vec2f,
  uvTransform: d.mat2x2f,
  outputSize: d.vec2u,
  mirrorX: d.u32,
  gpuSquareCrop: d.u32,
  swapAxes: d.u32,
  total: d.u32,
});

const preprocessLayout = tgpu.bindGroupLayout({
  params: { uniform: FrameParams },
  frame: { externalTexture: d.textureExternal() },
  sampler: { sampler: 'filtering' },
  output: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

function cubicWeight(distance: number): number {
  'use gpu';
  const x = std.abs(distance);
  if (x <= 1) {
    return (CUBIC_A + 2) * x * x * x - (CUBIC_A + 3) * x * x + 1;
  }
  if (x < 2) {
    return CUBIC_A * x * x * x - 5 * CUBIC_A * x * x + 8 * CUBIC_A * x - 4 * CUBIC_A;
  }
  return d.f32(0);
}

function sampleSourcePixel(pixel: d.v2f, sourceSize: d.v2f): d.v3f {
  'use gpu';
  const maxPixel = sourceSize - 1;
  const clamped = std.clamp(pixel, d.vec2f(0), maxPixel);
  const uv = (clamped + 0.5) / sourceSize;
  const transformedUv = preprocessLayout.$.params.uvTransform * (uv - d.vec2f(0.5)) + d.vec2f(0.5);
  return std.textureSampleBaseClampToEdge(
    preprocessLayout.$.frame,
    preprocessLayout.$.sampler,
    transformedUv,
  ).rgb;
}

export const depthFramePreprocessKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const params = preprocessLayout.$.params;
  const index = gid.x;
  if (index >= params.total) {
    return;
  }

  const outputX = index % params.outputSize.x;
  const outputY = std.intdiv(index, params.outputSize.x);
  const sourceOutputX = params.mirrorX === 0 ? outputX : params.outputSize.x - 1 - outputX;
  const outputPixel = d.vec2f(sourceOutputX, outputY);
  let sourceSize = d.vec2f(params.sourceSize);
  let cropOrigin = d.vec2f(params.cropOrigin);
  let cropSize = d.vec2f(params.cropSize);
  if (params.gpuSquareCrop !== 0) {
    sourceSize = d.vec2f(std.textureDimensions(preprocessLayout.$.frame));
    if (params.swapAxes !== 0) {
      sourceSize = sourceSize.yx;
    }
    const side = std.min(sourceSize.x, sourceSize.y);
    cropOrigin = (sourceSize - side) * 0.5;
    cropSize = d.vec2f(side);
  }
  const sourcePixel =
    cropOrigin + (outputPixel + 0.5) * (cropSize / d.vec2f(params.outputSize)) - 0.5;
  const base = std.floor(sourcePixel);

  let rgb = d.vec3f(0);
  let weightSum = d.f32(0);
  for (const tapY of tgpu.unroll(CUBIC_TAPS)) {
    const sampleY = base.y + tapY;
    const weightY = cubicWeight(sourcePixel.y - sampleY);
    for (const tapX of tgpu.unroll(CUBIC_TAPS)) {
      const sampleX = base.x + tapX;
      const weight = weightY * cubicWeight(sourcePixel.x - sampleX);
      rgb += sampleSourcePixel(d.vec2f(sampleX, sampleY), sourceSize) * weight;
      weightSum += weight;
    }
  }

  rgb /= weightSum;
  const mean = d.vec3f(0.485, 0.456, 0.406);
  const deviation = d.vec3f(0.229, 0.224, 0.225);
  preprocessLayout.$.output[index] = d.vec4f((rgb - mean) / deviation, 0);
});

/** Bicubic RGB-to-HWC4 preprocessing for the fixed model input profile */
export class DepthFramePreprocessor {
  readonly #root: TgpuRoot;
  readonly #output: Hwc4Buffer;
  readonly #outputSize: readonly [number, number];
  readonly #params: TgpuUniform<typeof FrameParams>;
  readonly #pipeline: TgpuComputePipeline;
  readonly #sampler: TgpuSampler;
  #destroyed = false;

  constructor(root: TgpuRoot, output: Hwc4Buffer, outputSize: readonly [number, number]) {
    this.#root = root;
    this.#output = output;
    this.#outputSize = outputSize;
    this.#params = root.createUniform(FrameParams);
    this.#sampler = root.createSampler({
      magFilter: 'nearest',
      minFilter: 'nearest',
    });
    this.#pipeline = root.createComputePipeline({ compute: depthFramePreprocessKernel });
  }

  initSync(): void {
    this.#assertAlive();
    this.#pipeline.initSync();
  }

  async initAsync(): Promise<void> {
    this.#assertAlive();
    await this.#pipeline.initAsync();
  }

  encode(pass: TgpuComputePass, frame: GPUExternalTexture, crop: DepthFrameCrop): void {
    this.#assertAlive();
    const [outputWidth, outputHeight] = this.#outputSize;
    const [sourceWidth, sourceHeight] = crop.sourceSize;
    const [cropX, cropY] = crop.cropOrigin;
    const [cropWidth, cropHeight] = crop.cropSize;

    this.#params.write({
      sourceSize: d.vec2f(sourceWidth, sourceHeight),
      cropOrigin: d.vec2f(cropX, cropY),
      cropSize: d.vec2f(cropWidth, cropHeight),
      uvTransform: crop.uvTransform ?? d.mat2x2f.identity(),
      outputSize: d.vec2u(outputWidth, outputHeight),
      mirrorX: crop.mirrorX ? 1 : 0,
      gpuSquareCrop: crop.gpuSquareCrop ? 1 : 0,
      swapAxes: crop.swapAxes ? 1 : 0,
      total: outputWidth * outputHeight,
    });

    const bindGroup = this.#root.createBindGroup(preprocessLayout, {
      params: this.#params,
      frame,
      sampler: this.#sampler,
      output: this.#output,
    });
    this.#pipeline
      .with(pass)
      .with(bindGroup)
      .dispatchWorkgroups(Math.ceil((outputWidth * outputHeight) / WORKGROUP_SIZE));
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.#params.buffer.destroy();
  }

  #assertAlive(): void {
    if (this.#destroyed) {
      throw new Error('Depth frame preprocessor has been destroyed.');
    }
  }
}
