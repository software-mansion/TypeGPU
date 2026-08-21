import { common, d } from 'typegpu';
import type {
  SampledFlag,
  StorageFlag,
  TgpuBindGroup,
  TgpuBuffer,
  TgpuComputePipeline,
  TgpuRenderPipeline,
  TgpuRoot,
  TgpuSampler,
  TgpuTexture,
  TgpuUniform,
  UniformFlag,
} from 'typegpu';
import type { DepthCameraFrame } from './camera-session.ts';
import { DepthDisparityRangeEstimator } from '../../common/depthart-inference/disparity-range.ts';
import type { DepthInferencePlan } from '../../common/depthart-inference/depthart.ts';
import {
  COLORIZE_WORKGROUP_SIZE,
  DEPTH_WORKGROUP_SIZE,
  DepthParams,
  colorizeKernel,
  colorizeLayout,
  depthPrepareKernel,
  depthPrepareLayout,
  presentFragment,
  presentLayout,
  rangeStabilityLayout,
  stabilizeRangeKernel,
} from './shaders.ts';

const MAX_CANVAS_SIDE = 1024;
const MAX_PIXEL_RATIO = 2;

type ColorTexture = TgpuTexture<{
  size: readonly [number, number];
  format: 'rgba8unorm';
}> &
  StorageFlag &
  SampledFlag;

interface DepthAttachment {
  readonly depthWorkgroups: number;
  readonly colorizeWorkgroups: readonly [number, number];
  readonly time: TgpuUniform<d.F32>;
  readonly disparity: TgpuBuffer<d.WgslArray<d.Vec4f>> & StorageFlag;
  readonly history: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
  readonly color: ColorTexture;
  readonly depthBindGroup: TgpuBindGroup<typeof depthPrepareLayout.entries>;
  readonly colorizeBindGroup: TgpuBindGroup<typeof colorizeLayout.entries>;
  readonly presentBindGroup: TgpuBindGroup<typeof presentLayout.entries>;
}

export class DepthPassRenderer {
  readonly #root: TgpuRoot;
  readonly #canvas: HTMLCanvasElement;
  readonly #context: GPUCanvasContext;
  readonly #rangeEstimator: DepthDisparityRangeEstimator;
  readonly #frameRange: TgpuBuffer<d.Vec2f> & StorageFlag;
  readonly #stableRange: TgpuBuffer<d.Vec2f> & StorageFlag;
  readonly #depthParams: TgpuBuffer<typeof DepthParams> & UniformFlag;
  readonly #sampler: TgpuSampler;
  readonly #rangeBindGroup: TgpuBindGroup<typeof rangeStabilityLayout.entries>;
  readonly #stabilizePipeline: TgpuComputePipeline;
  readonly #depthPipeline: TgpuComputePipeline;
  readonly #colorizePipeline: TgpuComputePipeline;
  readonly #presentPipeline: TgpuRenderPipeline<d.Vec4f>;
  #plan: DepthInferencePlan | undefined;
  #attachment: DepthAttachment | undefined;
  #mirror = true;
  #firstFrame = true;

  constructor(root: TgpuRoot, canvas: HTMLCanvasElement) {
    this.#root = root;
    this.#canvas = canvas;
    this.#context = root.configureContext({ canvas, alphaMode: 'opaque' });
    this.#rangeEstimator = new DepthDisparityRangeEstimator(root);
    this.#frameRange = root.createBuffer(d.vec2f, d.vec2f(0, 1)).$usage('storage');
    this.#stableRange = root.createBuffer(d.vec2f, d.vec2f(0, 1)).$usage('storage');
    this.#depthParams = root
      .createBuffer(DepthParams, { outputSize: d.vec2u(1), reset: 1 })
      .$usage('uniform');
    this.#sampler = root.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.#rangeBindGroup = root.createBindGroup(rangeStabilityLayout, {
      params: this.#depthParams,
      frameRange: this.#frameRange,
      stableRange: this.#stableRange,
    });
    this.#stabilizePipeline = root.createComputePipeline({ compute: stabilizeRangeKernel });
    this.#depthPipeline = root.createComputePipeline({ compute: depthPrepareKernel });
    this.#colorizePipeline = root.createComputePipeline({ compute: colorizeKernel });
    this.#presentPipeline = root.createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: presentFragment,
      targets: { format: navigator.gpu.getPreferredCanvasFormat() },
    });
  }

  async initAsync(): Promise<void> {
    await Promise.all([
      this.#rangeEstimator.initAsync(),
      this.#stabilizePipeline.initAsync(),
      this.#depthPipeline.initAsync(),
      this.#colorizePipeline.initAsync(),
      this.#presentPipeline.initAsync(),
    ]);
  }

  attach(plan: DepthInferencePlan): void {
    this.detach();
    const [width, height] = plan.outputSize;
    const pixelCount = width * height;
    const disparity = this.#root
      .createBuffer(d.arrayOf(d.vec4f, pixelCount), plan.outputBuffer)
      .$usage('storage');
    const history = this.#root.createBuffer(d.arrayOf(d.f32, pixelCount)).$usage('storage');
    const timeUniform = this.#root.createUniform(d.f32);
    const color: ColorTexture = this.#root
      .createTexture({ size: [width, height], format: 'rgba8unorm' })
      .$usage('storage', 'sampled');

    this.#plan = plan;
    this.#attachment = {
      depthWorkgroups: Math.ceil(pixelCount / DEPTH_WORKGROUP_SIZE),
      colorizeWorkgroups: [
        Math.ceil(width / COLORIZE_WORKGROUP_SIZE),
        Math.ceil(height / COLORIZE_WORKGROUP_SIZE),
      ],
      time: timeUniform,
      disparity,
      history,
      color,
      depthBindGroup: this.#root.createBindGroup(depthPrepareLayout, {
        params: this.#depthParams,
        disparity,
        stableRange: this.#stableRange,
        history,
      }),
      colorizeBindGroup: this.#root.createBindGroup(colorizeLayout, {
        time: timeUniform,
        params: this.#depthParams,
        depth: history,
        color: color.createView(d.textureStorage2d('rgba8unorm', 'write-only')),
      }),
      presentBindGroup: this.#root.createBindGroup(presentLayout, {
        color: color.createView(),
        sampler: this.#sampler,
      }),
    };
    this.#rangeEstimator.attach(disparity, this.#frameRange, pixelCount);
    this.#depthParams.write({ outputSize: d.vec2u(width, height), reset: 1 });
    this.#firstFrame = true;
  }

  detach(): void {
    this.#rangeEstimator.detach();
    const attachment = this.#attachment;
    if (attachment) {
      attachment.time.buffer.destroy();
      attachment.disparity.destroy();
      attachment.history.destroy();
      attachment.color.destroy();
    }
    this.#attachment = undefined;
    this.#plan = undefined;
  }

  update(settings: { mirror?: boolean }): void {
    if (settings.mirror !== undefined) {
      this.#mirror = settings.mirror;
    }
  }

  resetHistory(): void {
    this.#firstFrame = true;
  }

  render(frame: DepthCameraFrame): void {
    const plan = this.#plan;
    const attachment = this.#attachment;
    if (!plan || !attachment) {
      throw new Error('No depth inference plan is attached to the depth pass renderer.');
    }

    attachment.time.write((performance.now() % 4000) / 4000);

    this.#syncCanvasSize();
    this.#depthParams.patch({ reset: this.#firstFrame ? 1 : 0 });

    const encoder = this.#root['~unstable'].createCommandEncoder();
    const externalFrame = this.#root.device.importExternalTexture({ source: frame.source });

    const pass = encoder.beginComputePass();
    plan.encodeFrame(pass, externalFrame, {
      uvTransform: frame.uvTransform,
      mirrorX: this.#mirror,
      swapAxes: frame.swapAxes,
    });
    this.#rangeEstimator.encode(pass);
    this.#stabilizePipeline.with(pass).with(this.#rangeBindGroup).dispatchWorkgroups(1);
    this.#depthPipeline
      .with(pass)
      .with(attachment.depthBindGroup)
      .dispatchWorkgroups(attachment.depthWorkgroups);
    const [fieldX, fieldY] = attachment.colorizeWorkgroups;
    this.#colorizePipeline
      .with(pass)
      .with(attachment.colorizeBindGroup)
      .dispatchWorkgroups(fieldX, fieldY);
    pass.end();

    const renderPass = encoder.beginRenderPass({ colorAttachments: { view: this.#context } });
    this.#presentPipeline.with(renderPass).with(attachment.presentBindGroup).draw(3);
    renderPass.end();
    encoder.submit();
    this.#firstFrame = false;
  }

  destroy(): void {
    this.detach();
    this.#rangeEstimator.destroy();
    this.#frameRange.destroy();
    this.#stableRange.destroy();
    this.#depthParams.destroy();
    this.#context.unconfigure();
  }

  #syncCanvasSize(): void {
    const displayWidth = this.#canvas.clientWidth;
    if (displayWidth <= 0) {
      return;
    }
    const ratio = Math.min(globalThis.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const side = Math.min(MAX_CANVAS_SIDE, Math.max(1, Math.round(displayWidth * ratio)));
    if (this.#canvas.width !== side || this.#canvas.height !== side) {
      this.#canvas.width = side;
      this.#canvas.height = side;
    }
  }
}
