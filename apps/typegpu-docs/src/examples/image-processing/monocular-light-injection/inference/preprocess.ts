import { d, std, tgpu } from 'typegpu';
import type {
  TgpuComputePass,
  TgpuComputePipeline,
  TgpuRoot,
  TgpuSampler,
  TgpuUniform,
} from 'typegpu';
import type { Hwc4TensorBuffer } from './tensor-arena.ts';

const WORKGROUP_SIZE = 64;
const CUBIC_A = -0.75;
const CUBIC_TAPS = [-1, 0, 1, 2] as const;

/** The model always consumes a centered square crop of the source frame */
export interface DepthFrameOptions {
  readonly mirrorX: boolean;
  readonly uvTransform: d.m2x2f;
}

const FrameParams = d.struct({
  uvTransform: d.mat2x2f,
  outputSize: d.vec2u,
  mirrorX: d.u32,
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

const depthFramePreprocessKernel = tgpu.computeFn({
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
  const sourceSize = d.vec2f(std.textureDimensions(preprocessLayout.$.frame));
  const side = std.min(sourceSize.x, sourceSize.y);
  const cropOrigin = (sourceSize - side) * 0.5;
  const sourcePixel =
    cropOrigin + (outputPixel + 0.5) * (d.vec2f(side) / d.vec2f(params.outputSize)) - 0.5;
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

export class DepthFramePreprocessor {
  readonly #root: TgpuRoot;
  readonly #output: Hwc4TensorBuffer;
  readonly #outputSize: readonly [number, number];
  readonly #params: TgpuUniform<typeof FrameParams>;
  readonly #pipeline: TgpuComputePipeline;
  readonly #sampler: TgpuSampler;

  constructor(root: TgpuRoot, output: Hwc4TensorBuffer, outputSize: readonly [number, number]) {
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

  async initAsync(): Promise<void> {
    await this.#pipeline.initAsync();
  }

  encode(pass: TgpuComputePass, frame: GPUExternalTexture, options: DepthFrameOptions): void {
    const [outputWidth, outputHeight] = this.#outputSize;

    this.#params.write({
      uvTransform: options.uvTransform,
      outputSize: d.vec2u(outputWidth, outputHeight),
      mirrorX: options.mirrorX ? 1 : 0,
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
    this.#params.buffer.destroy();
  }
}
