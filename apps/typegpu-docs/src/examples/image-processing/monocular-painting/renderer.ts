import { randf } from '@typegpu/noise';
import {
  DEPTH_WORKGROUP_SIZE,
  DepthParams,
  SURFACE_WORKGROUP_SIZE,
  depthPrepareKernel,
  depthPrepareLayout,
  rangeStabilityLayout,
  stabilizeRangeKernel,
  surfaceKernel,
  surfaceOcclusionSlot,
  surfaceLayout,
} from '../../common/depthart/surface.ts';
import { common, d, std } from 'typegpu';
import type {
  SampledFlag,
  RenderFlag,
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
import type { DepthCameraFrame } from '../../common/depthart/camera-session.ts';
import { DepthDisparityRangeEstimator } from '../../common/depthart-inference/disparity-range.ts';
import type { DepthInferencePlan } from '../../common/depthart-inference/depthart.ts';
import {
  PaintMode,
  underpaintLayout,
  copyFrameFragment,
  downsampleFragment,
  Stroke,
  STROKES_PER_LAYER,
  prepareStrokes,
  prepareStrokeCells,
  StrokeCell,
  cellWriteLayout,
  strokeWriteLayout,
  strokeReadLayout,
  PaintParams,
  paintFragment,
  paintFrameLayout,
  paintLayout,
} from './shaders.ts';

const MAX_CANVAS_SIDE = 1024;
const MAX_PIXEL_RATIO = 2;

type SurfaceTexture = TgpuTexture<{
  size: readonly [number, number];
  format: 'rgba16float';
}> &
  StorageFlag &
  SampledFlag;

interface PaintAttachment {
  readonly depthWorkgroups: number;
  readonly fieldWorkgroups: readonly [number, number];
  readonly disparity: TgpuBuffer<d.WgslArray<d.Vec4f>> & StorageFlag;
  readonly history: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
  readonly surface: SurfaceTexture;
  readonly depthBindGroup: TgpuBindGroup<typeof depthPrepareLayout.entries>;
  readonly surfaceBindGroup: TgpuBindGroup<typeof surfaceLayout.entries>;
  readonly paintBindGroup: TgpuBindGroup<typeof paintLayout.entries>;
}

interface PaintingState {
  readonly mirror: boolean;
  readonly spacing: number;
  readonly detail: number;
  readonly texture: number;
  readonly opacity: number;
  readonly normalInfluence: number;
  readonly mode: number;
}

type PaintingSettings = Partial<PaintingState>;

export const defaultPaintingSettings: PaintingState = {
  mirror: true,
  spacing: 7,
  detail: 1.5,
  texture: 1,
  opacity: 0.45,
  normalInfluence: 1,
  mode: PaintMode.PAINTING,
};

export class DepthPaintingRenderer {
  readonly #root: TgpuRoot;
  readonly #canvas: HTMLCanvasElement;
  readonly #context: GPUCanvasContext;
  readonly #rangeEstimator: DepthDisparityRangeEstimator;
  readonly #frameRange: TgpuBuffer<d.Vec2f> & StorageFlag;
  readonly #stableRange: TgpuBuffer<d.Vec2f> & StorageFlag;
  readonly #depthParams: TgpuBuffer<typeof DepthParams> & UniformFlag;
  readonly #paintParams: TgpuBuffer<typeof PaintParams> & UniformFlag;
  readonly #sampler: TgpuSampler;
  readonly #grainSampler: TgpuSampler;
  #cellCount = 1;
  readonly #brushGrain: TgpuTexture<{ size: [number, number]; format: 'rgba8unorm' }> &
    SampledFlag &
    StorageFlag;
  readonly #rangeBindGroup: TgpuBindGroup<typeof rangeStabilityLayout.entries>;
  readonly #stabilizePipeline: TgpuComputePipeline;
  readonly #depthPipeline: TgpuComputePipeline;
  readonly #surfacePipeline: TgpuComputePipeline;
  readonly #paintPipeline: TgpuRenderPipeline<d.Vec4f>;
  readonly #strokes: TgpuBuffer<d.WgslArray<typeof Stroke>> & StorageFlag;
  readonly #strokeWriteGroup: TgpuBindGroup<typeof strokeWriteLayout.entries>;
  #strokeReadGroups: TgpuBindGroup<typeof strokeReadLayout.entries>[];
  readonly #paintHistory: (TgpuTexture<{ size: [number, number]; format: 'rgba8unorm' }> &
    SampledFlag &
    RenderFlag)[];
  readonly #historyViews: GPUTextureView[];
  readonly #presentGroups: TgpuBindGroup<typeof underpaintLayout.entries>[];
  readonly #presentPipeline: TgpuRenderPipeline<d.Vec4f>;
  #historyIndex = 0;
  #paintDirty = true;
  #lastPaintTime = performance.now();
  #revealStep = 1 / 6;
  #cells: TgpuBuffer<d.WgslArray<typeof StrokeCell>> & StorageFlag;
  #cellGroup: TgpuBindGroup<typeof cellWriteLayout.entries>;
  readonly #cellPipeline: TgpuComputePipeline;
  readonly #strokePipeline: TgpuComputePipeline;
  readonly #underpainting: TgpuTexture<{ size: [number, number]; format: 'rgba8unorm' }> &
    SampledFlag &
    RenderFlag;
  readonly #underpaintGroup: TgpuBindGroup<typeof underpaintLayout.entries>;
  readonly #mipGroups: TgpuBindGroup<typeof underpaintLayout.entries>[];
  readonly #mipViews: ReturnType<GPUTexture['createView']>[];
  readonly #copyPipeline: TgpuRenderPipeline<d.Vec4f>;
  readonly #mipPipeline: TgpuRenderPipeline<d.Vec4f>;
  #plan: DepthInferencePlan | undefined;
  #attachment: PaintAttachment | undefined;
  #uvTransform = d.mat2x2f.identity();
  #swapAxes = false;
  #firstFrame = true;
  #settings: PaintingState = defaultPaintingSettings;

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
    this.#paintParams = root.createBuffer(PaintParams).$usage('uniform');
    this.#sampler = root.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    });
    this.#rangeBindGroup = root.createBindGroup(rangeStabilityLayout, {
      params: this.#depthParams,
      frameRange: this.#frameRange,
      stableRange: this.#stableRange,
    });
    this.#stabilizePipeline = root.createComputePipeline({ compute: stabilizeRangeKernel });
    this.#depthPipeline = root.createComputePipeline({ compute: depthPrepareKernel });
    this.#surfacePipeline = root
      .with(surfaceOcclusionSlot, false)
      .createComputePipeline({ compute: surfaceKernel });
    this.#paintPipeline = root.createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: paintFragment,
      targets: { format: 'rgba8unorm' },
    });
    this.#strokes = root.createBuffer(d.arrayOf(Stroke, STROKES_PER_LAYER * 2)).$usage('storage');
    this.#cells = root.createBuffer(d.arrayOf(StrokeCell, this.#cellCount)).$usage('storage');
    this.#cellGroup = root.createBindGroup(cellWriteLayout, { cells: this.#cells });
    this.#cellPipeline = root.createComputePipeline({ compute: prepareStrokeCells });
    this.#strokeWriteGroup = root.createBindGroup(strokeWriteLayout, { strokes: this.#strokes });
    this.#paintHistory = Array.from({ length: 2 }, () =>
      root
        .createTexture({
          size: [1024, 1024],
          format: 'rgba8unorm',
        })
        .$usage('sampled', 'render'),
    );
    this.#historyViews = this.#paintHistory.map((texture) => root.unwrap(texture).createView());
    // Stable, independent noise channels sampled at different scales in brush space.
    // Build once; no per-frame random changes that could make the paint sparkle.
    this.#brushGrain = root
      .createTexture({ size: [128, 128], format: 'rgba8unorm' })
      .$usage('sampled', 'storage');
    const grainOutput = this.#brushGrain.createView(d.textureStorage2d('rgba8unorm', 'write-only'));
    root
      .createGuardedComputePipeline((x: number, y: number) => {
        'use gpu';
        randf.seed2(d.vec2f(x, y).add(0.731).div(128));
        std.textureStore(
          grainOutput.$,
          d.vec2u(x, y),
          d.vec4f(randf.sample(), randf.sample(), randf.sample(), randf.sample()),
        );
      })
      .dispatchThreads(128, 128);
    const grainSampler = root.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'repeat',
    });
    this.#grainSampler = grainSampler;
    this.#strokeReadGroups = this.#paintHistory.map((texture) =>
      root.createBindGroup(strokeReadLayout, {
        strokes: this.#strokes,
        cells: this.#cells,
        history: texture.createView(),
        grain: this.#brushGrain.createView(),
        grainSampler,
      }),
    );
    this.#presentGroups = this.#paintHistory.map((texture) =>
      root.createBindGroup(underpaintLayout, {
        image: texture.createView(),
        sampler: this.#sampler,
      }),
    );
    this.#presentPipeline = root.createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: downsampleFragment,
      targets: { format: navigator.gpu.getPreferredCanvasFormat() },
    });
    this.#strokePipeline = root.createComputePipeline({ compute: prepareStrokes });
    this.#underpainting = root
      .createTexture({ size: [1024, 1024], format: 'rgba8unorm', mipLevelCount: 11 })
      .$usage('sampled', 'render');
    this.#underpaintGroup = root.createBindGroup(underpaintLayout, {
      image: this.#underpainting.createView(),
      sampler: this.#sampler,
    });
    this.#mipViews = Array.from({ length: 11 }, (_, level) =>
      root.unwrap(this.#underpainting).createView({ baseMipLevel: level, mipLevelCount: 1 }),
    );
    this.#mipGroups = Array.from({ length: 10 }, (_, level) =>
      root.createBindGroup(underpaintLayout, {
        image: this.#underpainting.createView(d.texture2d(), {
          baseMipLevel: level,
          mipLevelCount: 1,
        }),
        sampler: this.#sampler,
      }),
    );
    this.#copyPipeline = root.createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: copyFrameFragment,
      targets: { format: 'rgba8unorm' },
    });
    this.#mipPipeline = root.createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: downsampleFragment,
      targets: { format: 'rgba8unorm' },
    });
    this.#writePaintParams();
  }

  async initAsync(): Promise<void> {
    await Promise.all([
      this.#rangeEstimator.initAsync(),
      this.#stabilizePipeline.initAsync(),
      this.#depthPipeline.initAsync(),
      this.#surfacePipeline.initAsync(),
      this.#paintPipeline.initAsync(),
      this.#strokePipeline.initAsync(),
      this.#cellPipeline.initAsync(),
      this.#copyPipeline.initAsync(),
      this.#mipPipeline.initAsync(),
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
      paintBindGroup: this.#root.createBindGroup(paintLayout, {
        params: this.#paintParams,
        surface: surface.createView(),
        sampler: this.#sampler,
      }),
    };
    this.#rangeEstimator.attach(disparity, this.#frameRange, pixelCount);
    this.#depthParams.write({ outputSize: d.vec2u(width, height), reset: 1 });
    this.#firstFrame = true;
    this.#paintDirty = true;
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

  update(settings: PaintingSettings): void {
    this.#paintDirty = true;
    this.#settings = {
      ...this.#settings,
      ...settings,
    };
  }

  resetHistory(): void {
    this.#firstFrame = true;
    this.#paintDirty = true;
  }

  render(frame: DepthCameraFrame, options?: { skipDepth?: boolean }): void {
    const plan = this.#plan;
    const attachment = this.#attachment;
    if (!plan || !attachment) {
      throw new Error('No depth inference plan is attached to the painting renderer.');
    }
    const updateDepth = !options?.skipDepth || this.#firstFrame;

    const now = performance.now();
    // A 100ms stroke; cap long gaps so returning to the tab does not pop marks in.
    this.#revealStep = Math.min(Math.max(now - this.#lastPaintTime, 1), 50) / 100;
    this.#lastPaintTime = now;
    this.#syncCanvasSize();
    this.#syncStrokeCells();
    this.#uvTransform = frame.uvTransform;
    this.#swapAxes = frame.swapAxes;
    this.#writePaintParams();
    if (updateDepth) {
      this.#depthParams.patch({ reset: this.#firstFrame ? 1 : 0 });
    }

    const encoder = this.#root['~unstable'].createCommandEncoder();
    const externalFrame = this.#root.device.importExternalTexture({ source: frame.source });
    if (updateDepth) {
      const pass = encoder.beginComputePass();
      plan.encodeFrame(pass, externalFrame, {
        uvTransform: frame.uvTransform,
        mirrorX: this.#settings.mirror,
        swapAxes: frame.swapAxes,
      });
      this.#rangeEstimator.encode(pass);
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
    }

    const frameGroup = this.#root.createBindGroup(paintFrameLayout, { frame: externalFrame });
    const copyPass = encoder.beginRenderPass({ colorAttachments: { view: this.#mipViews[0] } });
    this.#copyPipeline.with(copyPass).with(attachment.paintBindGroup).with(frameGroup).draw(3);
    copyPass.end();
    for (let level = 1; level < this.#mipViews.length; level++) {
      const mipPass = encoder.beginRenderPass({
        colorAttachments: { view: this.#mipViews[level] },
      });
      this.#mipPipeline
        .with(mipPass)
        .with(this.#mipGroups[level - 1])
        .draw(3);
      mipPass.end();
    }
    const strokePass = encoder.beginComputePass();
    this.#strokePipeline
      .with(strokePass)
      .with(attachment.paintBindGroup)
      .with(frameGroup)
      .with(this.#strokeWriteGroup)
      .with(this.#underpaintGroup)
      .dispatchWorkgroups(
        Math.ceil(this.#canvas.width / this.#settings.spacing / 8),
        Math.ceil(this.#canvas.height / this.#settings.spacing / 8),
        2,
      );
    this.#cellPipeline
      .with(strokePass)
      .with(attachment.paintBindGroup)
      .with(this.#strokeWriteGroup)
      .with(this.#cellGroup)
      .dispatchWorkgroups(
        Math.ceil(this.#canvas.width / this.#settings.spacing / 8),
        Math.ceil(this.#canvas.height / this.#settings.spacing / 8),
      );
    strokePass.end();

    const nextHistory = 1 - this.#historyIndex;
    // Explicit ping-pong history survives presentation; canvas swapchain contents do not.
    const pass = encoder.beginRenderPass({
      colorAttachments: { view: this.#historyViews[nextHistory] },
    });
    this.#paintPipeline
      .with(pass)
      .with(attachment.paintBindGroup)
      .with(frameGroup)
      .with(this.#strokeReadGroups[this.#historyIndex])
      .with(this.#underpaintGroup)
      .draw(3);
    pass.end();
    const present = encoder.beginRenderPass({ colorAttachments: { view: this.#context } });
    this.#presentPipeline.with(present).with(this.#presentGroups[nextHistory]).draw(3);
    present.end();
    encoder.submit();
    this.#historyIndex = nextHistory;
    this.#paintDirty = false;
    this.#firstFrame = false;
  }

  destroy(): void {
    this.detach();
    this.#rangeEstimator.destroy();
    this.#frameRange.destroy();
    this.#stableRange.destroy();
    this.#depthParams.destroy();
    this.#paintParams.destroy();
    this.#strokes.destroy();
    this.#cells.destroy();
    this.#underpainting.destroy();
    this.#brushGrain.destroy();
    for (const texture of this.#paintHistory) {
      texture.destroy();
    }
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
      this.#paintDirty = true;
      this.#canvas.width = side;
      this.#canvas.height = side;
    }
  }

  #syncStrokeCells(): void {
    const count =
      Math.ceil(this.#canvas.width / this.#settings.spacing) *
      Math.ceil(this.#canvas.height / this.#settings.spacing);
    if (count === this.#cellCount) {
      return;
    }
    this.#cells.destroy();
    this.#cellCount = count;
    this.#cells = this.#root.createBuffer(d.arrayOf(StrokeCell, count)).$usage('storage');
    this.#cellGroup = this.#root.createBindGroup(cellWriteLayout, { cells: this.#cells });
    this.#strokeReadGroups = this.#paintHistory.map((texture) =>
      this.#root.createBindGroup(strokeReadLayout, {
        strokes: this.#strokes,
        cells: this.#cells,
        history: texture.createView(),
        grain: this.#brushGrain.createView(),
        grainSampler: this.#grainSampler,
      }),
    );
    this.#paintDirty = true;
  }

  #writePaintParams(): void {
    this.#paintParams.write({
      uvTransform: this.#uvTransform,
      canvasSize: d.vec2f(this.#canvas.width, this.#canvas.height),
      spacing: this.#settings.spacing,
      detail: this.#settings.detail,
      texture: this.#settings.texture,
      opacity: this.#settings.opacity,
      normalInfluence: this.#settings.normalInfluence,
      swapAxes: this.#swapAxes ? 1 : 0,
      mirror: this.#settings.mirror ? 1 : 0,
      mode: this.#settings.mode,
      resetPaint: this.#paintDirty ? 1 : 0,
      revealStep: this.#revealStep,
    });
  }
}
