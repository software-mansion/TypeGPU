import { d } from 'typegpu';
import type { TgpuBindGroup, TgpuComputePipeline, TgpuRoot } from 'typegpu';
import type { VideoFrameCrop } from '../frame.ts';
import {
  initialUpsampleParams,
  personCorePriorKernel,
  MODEL_PIXELS,
  POST_PROCESS_WORKGROUPS,
  postProcessParams,
  priorLayout,
  temporalAccumulatorKernel,
  temporalLayout,
  upsampleFrameLayout,
  upsampleMaskLayout,
  upsampleParams,
  upsampleParamsLayout,
  upsampleSamplerLayout,
  upsampleToTextureKernel,
  UPSAMPLE_WORKGROUP_SIZE,
} from './kernels.ts';
import type {
  MaskOutputSize,
  MaskBuffer,
  MaskPostProcessProfile,
  MaskTarget,
  SampledMaskView,
} from './types.ts';

export class MaskPostProcessor {
  readonly #root: TgpuRoot;
  readonly #rawMask: MaskBuffer;
  readonly #paramsBuffer;
  readonly #upsampleParamsBuffer;
  readonly #temporalMask: MaskBuffer;
  readonly #priorMask: MaskBuffer;
  readonly #temporal: ComputeStage;
  readonly #prior: ComputeStage;
  readonly #upsamplePipeline: TgpuComputePipeline;
  readonly #upsampleParamsBindGroup: TgpuBindGroup<typeof upsampleParamsLayout.entries>;
  readonly #upsampleSamplerBindGroup: TgpuBindGroup<typeof upsampleSamplerLayout.entries>;
  #upsampleMaskBindGroup: TgpuBindGroup<typeof upsampleMaskLayout.entries> | undefined;
  #upsampleMaskSource: MaskBuffer | undefined;
  #upsampleMaskTarget: MaskTarget | undefined;
  #target: MaskTarget;
  #initialized = false;

  constructor(root: TgpuRoot, rawMask: MaskBuffer) {
    const paramsBuffer = root.createBuffer(postProcessParams, { initialized: 0 }).$usage('uniform');
    const upsampleParamsBuffer = root
      .createBuffer(upsampleParams, initialUpsampleParams)
      .$usage('uniform');
    const historyLogits = createMaskBuffer(root);
    const temporalMask = createMaskBuffer(root);
    const priorMask = createMaskBuffer(root);
    const target = createMaskTarget(root, 1, 1);
    const sampler = root.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });

    this.#root = root;
    this.#rawMask = rawMask;
    this.#paramsBuffer = paramsBuffer;
    this.#upsampleParamsBuffer = upsampleParamsBuffer;
    this.#temporalMask = temporalMask;
    this.#priorMask = priorMask;
    this.#target = target;
    this.#upsampleParamsBindGroup = root.createBindGroup(upsampleParamsLayout, {
      params: upsampleParamsBuffer,
    });
    this.#upsampleSamplerBindGroup = root.createBindGroup(upsampleSamplerLayout, {
      sampler,
    });
    this.#temporal = {
      pipeline: root.createComputePipeline({ compute: temporalAccumulatorKernel }),
      bindGroup: root.createBindGroup(temporalLayout, {
        params: paramsBuffer,
        raw: rawMask,
        historyLogits,
        filtered: temporalMask,
      }),
      workgroups: POST_PROCESS_WORKGROUPS,
    };
    this.#prior = {
      pipeline: root.createComputePipeline({ compute: personCorePriorKernel }),
      bindGroup: root.createBindGroup(priorLayout, {
        src: temporalMask,
        dst: priorMask,
      }),
      workgroups: POST_PROCESS_WORKGROUPS,
    };
    this.#upsamplePipeline = root.createComputePipeline({ compute: upsampleToTextureKernel });
  }

  get maskView(): SampledMaskView {
    return this.#target.sampleView;
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
    const target = this.#ensureOutputTexture(outputSize);

    let source = this.#rawMask;
    let edgeAware = 0;
    if (profile !== 'raw') {
      this.#paramsBuffer.write({ initialized: this.#initialized ? 1 : 0 });
      dispatchStage(pass, this.#temporal);
      source = this.#temporalMask;
      this.#initialized = true;
    }

    if (profile === 'balanced') {
      dispatchStage(pass, this.#prior);
      source = this.#priorMask;
      edgeAware = 1;
    }

    this.#upsampleParamsBuffer.write({
      ...crop,
      edgeAware,
    });

    const frameBindGroup = this.#root.createBindGroup(upsampleFrameLayout, {
      frame: externalTexture,
    });

    this.#upsamplePipeline
      .with(pass)
      .with(this.#upsampleParamsBindGroup)
      .with(frameBindGroup)
      .with(this.#upsampleMaskBindGroupFor(source, target))
      .with(this.#upsampleSamplerBindGroup)
      .dispatchWorkgroups(target.workgroupsX, target.workgroupsY);
  }

  #ensureOutputTexture({ width, height }: MaskOutputSize): MaskTarget {
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));
    const [currentWidth, currentHeight] = this.#target.texture.props.size;
    if (nextWidth === currentWidth && nextHeight === currentHeight) {
      return this.#target;
    }

    const target = createMaskTarget(this.#root, nextWidth, nextHeight);
    this.#target.texture.destroy();
    this.#target = target;
    return target;
  }

  #upsampleMaskBindGroupFor(
    source: MaskBuffer,
    target: MaskTarget,
  ): TgpuBindGroup<typeof upsampleMaskLayout.entries> {
    if (
      this.#upsampleMaskSource === source &&
      this.#upsampleMaskTarget === target &&
      this.#upsampleMaskBindGroup
    ) {
      return this.#upsampleMaskBindGroup;
    }

    this.#upsampleMaskSource = source;
    this.#upsampleMaskTarget = target;
    this.#upsampleMaskBindGroup = this.#root.createBindGroup(upsampleMaskLayout, {
      src: source,
      output: target.storageView,
    });
    return this.#upsampleMaskBindGroup;
  }
}

function createMaskBuffer(root: TgpuRoot): MaskBuffer {
  return root.createBuffer(d.arrayOf(d.f32, MODEL_PIXELS)).$usage('storage');
}

function createMaskTarget(root: TgpuRoot, width: number, height: number): MaskTarget {
  const texture = root
    .createTexture({
      size: [width, height],
      format: 'rgba16float',
    })
    .$usage('storage', 'sampled');
  return {
    texture,
    sampleView: texture.createView(),
    storageView: texture.createView(d.textureStorage2d('rgba16float', 'write-only')),
    workgroupsX: Math.ceil(width / UPSAMPLE_WORKGROUP_SIZE),
    workgroupsY: Math.ceil(height / UPSAMPLE_WORKGROUP_SIZE),
  };
}

interface ComputeStage {
  pipeline: TgpuComputePipeline;
  bindGroup: TgpuBindGroup;
  workgroups: number;
}

function dispatchStage(pass: GPUComputePassEncoder, stage: ComputeStage): void {
  stage.pipeline.with(pass).with(stage.bindGroup).dispatchWorkgroups(stage.workgroups);
}
