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
  UniformFlag,
} from 'typegpu';
import type { DepthCameraFrame } from './camera-session.ts';
import { DepthDisparityRangeEstimator } from './inference/disparity-range.ts';
import type { DepthInferencePlan } from './inference/depthart.ts';
import {
  DEPTH_WORKGROUP_SIZE,
  DepthParams,
  RelightMode,
  RelightParams,
  SURFACE_FAR_Z,
  SURFACE_WORKGROUP_SIZE,
  depthPrepareKernel,
  depthPrepareLayout,
  rangeStabilityLayout,
  relightFragment,
  relightFrameLayout,
  relightLayout,
  stabilizeRangeKernel,
  surfaceKernel,
  surfaceLayout,
} from './shaders.ts';

const MAX_CANVAS_SIDE = 1024;
const MAX_PIXEL_RATIO = 2;

/**
 * Travel available to the light along the view axis.
 *
 * The floor is derived from the scene rather than chosen: the light stays this
 * far in front of the furthest surface, so it can pass behind the subject and
 * behind midground clutter but never behind the back wall, where it lit nothing
 * and the frame just went dim.
 *
 * The ceiling is bounded by the bulb rather than by the lighting: its radius goes
 * as `1 / (BULB_CAMERA_Z - lightZ)`, so past about 1.6 the sphere swallows the
 * frame.
 */
const LIGHT_Z_CLEARANCE = 0.1;
export const LIGHT_Z_MIN = SURFACE_FAR_Z + LIGHT_Z_CLEARANCE;
export const LIGHT_Z_MAX = 1.55;

type SurfaceTexture = TgpuTexture<{
  size: readonly [number, number];
  format: 'rgba16float';
}> &
  StorageFlag &
  SampledFlag;

interface RelightAttachment {
  readonly depthWorkgroups: number;
  readonly fieldWorkgroups: readonly [number, number];
  readonly disparity: TgpuBuffer<d.WgslArray<d.Vec4f>> & StorageFlag;
  readonly history: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
  readonly surface: SurfaceTexture;
  readonly depthBindGroup: TgpuBindGroup<typeof depthPrepareLayout.entries>;
  readonly surfaceBindGroup: TgpuBindGroup<typeof surfaceLayout.entries>;
  readonly relightBindGroup: TgpuBindGroup<typeof relightLayout.entries>;
}

export interface RelightingState {
  readonly lightPosition: readonly [number, number];
  readonly lightZ: number;
  readonly mirror: boolean;
  readonly lightColor: readonly [number, number, number];
  readonly exposure: number;
  readonly intensity: number;
  readonly relief: number;
  readonly specular: number;
  readonly shadow: number;
  readonly occlusion: number;
  readonly mode: number;
}

export type RelightingSettings = Partial<RelightingState>;

export interface RelightingFrameTiming {
  readonly milliseconds: number;
}

export const defaultRelightingSettings: RelightingState = {
  lightPosition: [0.34, 0.34],
  lightZ: 0.42,
  mirror: true,
  lightColor: [1, 0.72, 0.46],
  exposure: 0.5,
  intensity: 1.7,
  relief: 0.85,
  specular: 0.22,
  shadow: 0.7,
  occlusion: 0.55,
  mode: RelightMode.RELIT,
};

/**
 * Relights the camera feed from the model's relative disparity. The color comes
 * straight from the video at canvas resolution; the depth field only drives the
 * light, so the image never inherits the model's resolution.
 */
export class DepthRelightingRenderer {
  readonly #root: TgpuRoot;
  readonly #canvas: HTMLCanvasElement;
  readonly #context: GPUCanvasContext;
  readonly #rangeEstimator: DepthDisparityRangeEstimator;
  readonly #frameRange: TgpuBuffer<d.Vec2f> & StorageFlag;
  readonly #stableRange: TgpuBuffer<d.Vec2f> & StorageFlag;
  readonly #depthParams: TgpuBuffer<typeof DepthParams> & UniformFlag;
  readonly #relightParams: TgpuBuffer<typeof RelightParams> & UniformFlag;
  readonly #sampler: TgpuSampler;
  readonly #rangeBindGroup: TgpuBindGroup<typeof rangeStabilityLayout.entries>;
  readonly #stabilizePipeline: TgpuComputePipeline;
  readonly #depthPipeline: TgpuComputePipeline;
  readonly #surfacePipeline: TgpuComputePipeline;
  readonly #relightPipeline: TgpuRenderPipeline<d.Vec4f>;
  #plan: DepthInferencePlan | undefined;
  #attachment: RelightAttachment | undefined;
  #uvTransform = d.mat2x2f.identity();
  #swapAxes = false;
  #firstFrame = true;
  #settings: RelightingState = defaultRelightingSettings;
  #destroyed = false;

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
    this.#relightParams = root.createBuffer(RelightParams).$usage('uniform');
    this.#sampler = root.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.#rangeBindGroup = root.createBindGroup(rangeStabilityLayout, {
      params: this.#depthParams,
      frameRange: this.#frameRange,
      stableRange: this.#stableRange,
    });
    this.#stabilizePipeline = root
      .createComputePipeline({ compute: stabilizeRangeKernel })
      .$name('Depth relighting range stability');
    this.#depthPipeline = root
      .createComputePipeline({ compute: depthPrepareKernel })
      .$name('Depth relighting depth field');
    this.#surfacePipeline = root
      .createComputePipeline({ compute: surfaceKernel })
      .$name('Depth relighting surface field');
    this.#relightPipeline = root
      .createRenderPipeline({
        vertex: common.fullScreenTriangle,
        fragment: relightFragment,
        targets: { format: navigator.gpu.getPreferredCanvasFormat() },
      })
      .$name('Depth relighting');
    this.#writeRelightParams();
  }

  async initAsync(): Promise<void> {
    this.#assertAlive();
    await Promise.all([
      this.#rangeEstimator.initAsync(),
      this.#stabilizePipeline.initAsync(),
      this.#depthPipeline.initAsync(),
      this.#surfacePipeline.initAsync(),
      this.#relightPipeline.initAsync(),
    ]);
  }

  attach(plan: DepthInferencePlan): void {
    this.#assertAlive();
    this.detach();
    const [, , height, width] = plan.outputShape;
    const pixelCount = width * height;
    const disparity = this.#root
      .createBuffer(d.arrayOf(d.vec4f, pixelCount), plan.outputBuffer)
      .$usage('storage');
    const history = this.#root.createBuffer(d.arrayOf(d.f32, pixelCount)).$usage('storage');
    const surface: SurfaceTexture = this.#root
      .createTexture({ size: [width, height], format: 'rgba16float' })
      .$usage('storage', 'sampled');

    this.#plan = plan;
    this.#attachment = {
      depthWorkgroups: Math.ceil(pixelCount / DEPTH_WORKGROUP_SIZE),
      fieldWorkgroups: [
        Math.ceil(width / SURFACE_WORKGROUP_SIZE),
        Math.ceil(height / SURFACE_WORKGROUP_SIZE),
      ],
      disparity,
      history,
      surface,
      depthBindGroup: this.#root.createBindGroup(depthPrepareLayout, {
        params: this.#depthParams,
        disparity,
        stableRange: this.#stableRange,
        history,
      }),
      surfaceBindGroup: this.#root.createBindGroup(surfaceLayout, {
        params: this.#depthParams,
        depth: history,
        surface: surface.createView(d.textureStorage2d('rgba16float', 'write-only')),
      }),
      relightBindGroup: this.#root.createBindGroup(relightLayout, {
        params: this.#relightParams,
        surface: surface.createView(),
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
      attachment.disparity.destroy();
      attachment.history.destroy();
      attachment.surface.destroy();
    }
    this.#attachment = undefined;
    this.#plan = undefined;
  }

  update(settings: RelightingSettings): void {
    this.#assertAlive();
    this.#settings = {
      ...this.#settings,
      ...settings,
      lightPosition: [...(settings.lightPosition ?? this.#settings.lightPosition)],
      lightColor: [...(settings.lightColor ?? this.#settings.lightColor)],
      lightZ: Math.min(
        LIGHT_Z_MAX,
        Math.max(LIGHT_Z_MIN, settings.lightZ ?? this.#settings.lightZ),
      ),
    };
    this.#writeRelightParams();
  }

  resetHistory(): void {
    this.#firstFrame = true;
  }

  async render(frame: DepthCameraFrame): Promise<RelightingFrameTiming> {
    this.#assertAlive();
    const plan = this.#plan;
    const attachment = this.#attachment;
    if (!plan || !attachment) {
      throw new Error('No depth inference plan is attached to the relighting renderer.');
    }

    this.#syncCanvasSize();
    this.#uvTransform = frame.uvTransform;
    this.#swapAxes = frame.swapAxes;
    this.#writeRelightParams();
    this.#depthParams.patch({ reset: this.#firstFrame ? 1 : 0 });

    const startedAt = performance.now();
    const encoder = this.#root.device.createCommandEncoder({ label: 'Depth relighting frame' });
    const externalFrame = this.#root.device.importExternalTexture({ source: frame.source });
    plan.runFrame(
      externalFrame,
      {
        sourceSize: [frame.sourceWidth, frame.sourceHeight],
        cropOrigin: [0, 0],
        cropSize: [frame.sourceWidth, frame.sourceHeight],
        uvTransform: frame.uvTransform,
        gpuSquareCrop: true,
        mirrorX: this.#settings.mirror,
        swapAxes: frame.swapAxes,
      },
      { encoder },
    );
    this.#rangeEstimator.encode(encoder);

    const pass = encoder.beginComputePass({ label: 'Depth relighting fields' });
    this.#stabilizePipeline.with(pass).with(this.#rangeBindGroup).dispatchWorkgroups(1);
    this.#depthPipeline
      .with(pass)
      .with(attachment.depthBindGroup)
      .dispatchWorkgroups(attachment.depthWorkgroups);
    const [fieldX, fieldY] = attachment.fieldWorkgroups;
    this.#surfacePipeline
      .with(pass)
      .with(attachment.surfaceBindGroup)
      .dispatchWorkgroups(fieldX, fieldY);
    pass.end();

    this.#relightPipeline
      .with(attachment.relightBindGroup)
      .with(this.#root.createBindGroup(relightFrameLayout, { frame: externalFrame }))
      .with(encoder)
      .withColorAttachment({ view: this.#context })
      .draw(3);
    this.#root.device.queue.submit([encoder.finish()]);
    this.#firstFrame = false;
    await this.#root.device.queue.onSubmittedWorkDone();
    return { milliseconds: performance.now() - startedAt };
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.detach();
    this.#destroyed = true;
    this.#rangeEstimator.destroy();
    this.#frameRange.destroy();
    this.#stableRange.destroy();
    this.#depthParams.destroy();
    this.#relightParams.destroy();
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

  #writeRelightParams(): void {
    this.#relightParams.write({
      uvTransform: this.#uvTransform,
      lightColor: d.vec4f(...this.#settings.lightColor, 1),
      lightPosition: d.vec2f(...this.#settings.lightPosition),
      lightZ: this.#settings.lightZ,
      exposure: this.#settings.exposure,
      intensity: this.#settings.intensity,
      relief: this.#settings.relief,
      specular: this.#settings.specular,
      shadow: this.#settings.shadow,
      occlusion: this.#settings.occlusion,
      swapAxes: this.#swapAxes ? 1 : 0,
      mirror: this.#settings.mirror ? 1 : 0,
      mode: this.#settings.mode,
    });
  }

  #assertAlive(): void {
    if (this.#destroyed) {
      throw new Error('The depth relighting renderer has been destroyed.');
    }
  }
}
