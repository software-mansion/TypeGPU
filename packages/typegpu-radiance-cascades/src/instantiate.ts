import type {
  d,
  SampledFlag,
  StorageFlag,
  TgpuBindGroup,
  TgpuComputePass,
  TgpuComputePipeline,
  TgpuRoot,
  TgpuTexture,
  TgpuTextureView,
} from 'typegpu';
import type { RadianceCascadesDefinition } from './define.ts';
import { getCascadeInfo } from './layout.ts';

type RadianceTexture = TgpuTexture<{ size: [number, number]; format: 'rgba16float' }> & StorageFlag;

/** @category Module */
export type RadianceCascadesOutput =
  | RadianceTexture
  | TgpuTextureView<d.WgslStorageTexture2d<'rgba16float', 'write-only'>>;

/** @category Module */
export type RadianceCascadesOutputSize = { width: number; height: number };

/**
 * Sizes and resources of one SDF runner instance.
 * @category Module
 */
export type RadianceCascadesIo = {
  /** Resolution at which the SDF resolves detail; limits the hit tolerance and step size. */
  sdfResolution: { width: number; height: number };

  /** Texture or storage view to write the lighting into. Created by the instance when omitted. */
  output?: RadianceCascadesOutput | undefined;
  /** Lighting size. Required when there is no `output`, or when the output view has no size. */
  size?: RadianceCascadesOutputSize | undefined;
  /** Scene aspect (width / height). Defaults to the output aspect. */
  renderAspect?: number | undefined;

  /** Distances ending in Probes use the finest lighting-sample spacing as their unit. */
  erodeBiasProbes?: number | undefined;
  epsProbes?: number | undefined;
  minStepProbes?: number | undefined;

  /** Bind groups for explicit layouts that the scene callbacks read. */
  bindGroups?: readonly TgpuBindGroup[] | undefined;
};

/**
 * @category Module
 */
export interface RadianceCascadesInstance<
  TOutput extends RadianceCascadesOutput = RadianceCascadesOutput,
> {
  /** The lighting texture. Owned by the instance unless it was passed in `io.output`. */
  readonly output: TOutput;
  /** Records the lighting update into a compute pass. Does not end the pass. */
  step(pass: TgpuComputePass | GPUComputePassEncoder): void;
  /** Optional: compiles the pipelines ahead of the first step. */
  initSync(): void;
  /** Optional: compiles the pipelines ahead of the first step. */
  initAsync(): Promise<void>;
  /** Frees the textures and buffers the instance created. Safe to call twice. */
  destroy(): void;
  [Symbol.dispose](): void;
}

/** @category Module */
export type OutputOf<TIo extends RadianceCascadesIo> = TIo['output'] extends RadianceCascadesOutput
  ? TIo['output']
  : RadianceTexture & SampledFlag;

function isOwnTexture(value: RadianceCascadesOutput): value is RadianceTexture {
  return value.resourceType === 'texture';
}

/**
 * Allocates the cascade textures and per-layer uniforms for one output size.
 * @category Module
 */
export function instantiate<TIo extends RadianceCascadesIo>(
  root: TgpuRoot,
  definition: RadianceCascadesDefinition,
  io: TIo,
): RadianceCascadesInstance<OutputOf<TIo>>;
export function instantiate(
  root: TgpuRoot,
  definition: RadianceCascadesDefinition,
  io: RadianceCascadesIo,
): RadianceCascadesInstance {
  const { output, size, sdfResolution, bindGroups = [] } = io;
  const { layouts, schemas, pipelines, baseStoredRayDim } = definition;

  const outputSize = output ? (isOwnTexture(output) ? output.props.size : output.size) : undefined;
  const [outputWidth, outputHeight] = outputSize ?? [size?.width, size?.height];
  if (!outputWidth || !outputHeight) {
    throw new Error('Size could not be inferred from output, pass explicit size in io.');
  }
  if (!(sdfResolution.width > 0) || !(sdfResolution.height > 0)) {
    throw new Error('sdfResolution must be positive.');
  }

  const {
    renderAspect = outputWidth / outputHeight,
    erodeBiasProbes = 1,
    epsProbes = 0.25,
    minStepProbes = 0.125,
  } = io;
  if (erodeBiasProbes < 0 || epsProbes < 0 || minStepProbes < 0) {
    throw new Error('Probe distances must be non-negative.');
  }

  const { baseProbes, cascadeDim, cascadeCount, layers } = getCascadeInfo(
    outputWidth,
    outputHeight,
    { baseStoredRayDim, renderAspect },
  );
  const cascadeProbesMin = Math.min(...baseProbes);
  const sdfTexelSizeMin = 1 / Math.min(sdfResolution.width, sdfResolution.height);
  const eps = Math.max(sdfTexelSizeMin, epsProbes / cascadeProbesMin);
  const minStep = Math.max(sdfTexelSizeMin * 0.5, minStepProbes / cascadeProbesMin);

  const ownOutput = output
    ? undefined
    : root
        .createTexture({ size: [outputWidth, outputHeight], format: 'rgba16float' })
        .$usage('storage', 'sampled');
  const dst = output ?? (ownOutput as RadianceTexture & SampledFlag);

  const cascadeTextureA = root
    .createTexture({ size: cascadeDim, format: 'rgba16float' })
    .$usage('storage', 'sampled');
  const cascadeTextureB = root
    .createTexture({ size: cascadeDim, format: 'rgba16float' })
    .$usage('storage', 'sampled');
  const cascadeSampler = root.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  const withBindGroups = (pipeline: TgpuComputePipeline) =>
    bindGroups.reduce((bound, group) => bound.with(group), pipeline);

  // Each layer reads its own uniform, written once here, so steps never write to the queue
  const cascadePasses = layers.map((layerInfo) => {
    const { layer, validDim } = layerInfo;
    const writeToA = (cascadeCount - 1 - layer) % 2 === 0;

    const layerParams = root.createUniform(schemas.CascadeLayerParams, {
      probes: layerInfo.probes,
      probesU: layerInfo.probesU,
      validDim: layerInfo.validDim,
      raysDimStored: layerInfo.raysDimStored,
      startT: layerInfo.startT,
      endT: layerInfo.endT,
      aspect: renderAspect,
      eps,
      minStep,
      hitBias: erodeBiasProbes / cascadeProbesMin,
    });

    const bindGroup = root.createBindGroup(layouts.cascadePass, {
      layerParams,
      upper: writeToA ? cascadeTextureB : cascadeTextureA,
      upperSampler: cascadeSampler,
      dst: writeToA ? cascadeTextureA : cascadeTextureB,
    });

    const pipeline = layer === cascadeCount - 1 ? pipelines.topCascade : pipelines.mergeCascade;
    return {
      layerParams,
      pipeline: withBindGroups(pipeline.with(bindGroup)),
      workgroups: [Math.ceil(validDim[0] / 8), Math.ceil(validDim[1] / 8)] as const,
    };
  });
  // Top cascade first
  cascadePasses.reverse();

  const buildRadianceFieldParams = root.createUniform(schemas.BuildRadianceFieldParams, {
    probes: baseProbes,
  });
  const cascade0InA = (cascadeCount - 1) % 2 === 0;
  const buildRadianceField = withBindGroups(
    pipelines.buildRadianceField.with(
      root.createBindGroup(layouts.buildRadianceField, {
        params: buildRadianceFieldParams,
        src: cascade0InA ? cascadeTextureA : cascadeTextureB,
        srcSampler: cascadeSampler,
        dst,
      }),
    ),
  );
  const outputWorkgroups = [Math.ceil(outputWidth / 8), Math.ceil(outputHeight / 8)] as const;

  let destroyed = false;
  function assertAlive() {
    if (destroyed) {
      throw new Error('@typegpu/radiance-cascades: the instance has been destroyed.');
    }
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    cascadeTextureA.destroy();
    cascadeTextureB.destroy();
    buildRadianceFieldParams.buffer.destroy();
    for (const { layerParams } of cascadePasses) {
      layerParams.buffer.destroy();
    }
    ownOutput?.destroy();
  }

  const definitionPipelines = Object.values(pipelines);

  return {
    output: dst,
    step(pass) {
      assertAlive();
      const computePass = pass as TgpuComputePass;
      for (const { pipeline, workgroups } of cascadePasses) {
        pipeline.with(computePass).dispatchWorkgroups(...workgroups);
      }
      buildRadianceField.with(computePass).dispatchWorkgroups(...outputWorkgroups);
    },
    initSync() {
      assertAlive();
      for (const pipeline of definitionPipelines) {
        pipeline.initSync();
      }
    },
    async initAsync() {
      assertAlive();
      await Promise.all(definitionPipelines.map((pipeline) => pipeline.initAsync()));
    },
    destroy,
    [Symbol.dispose]: destroy,
  };
}
