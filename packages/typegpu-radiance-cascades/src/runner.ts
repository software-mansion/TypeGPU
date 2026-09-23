import {
  d,
  isTexture,
  type SampledFlag,
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuCommandEncoder,
  type TgpuRoot,
  type TgpuTexture,
  type TgpuTextureView,
} from 'typegpu';
import {
  type BaseStoredRayDim,
  baseStoredRayDimSlot,
  buildRadianceFieldBGL,
  buildRadianceFieldCompute,
  BuildRadianceFieldParams,
  cascadePassBGL,
  cascadePassCompute,
  CascadeLayerParams,
  emissionSlot,
  defaultRayMarch,
  getCascadeInfo,
  hasUpperCascadeSlot,
  mergeModeSlot,
  maxRayStepsAccess,
  type MergeMode,
  rayMarchStepSafetyAccess,
  type RayMarchResult,
  rayMarchSlot,
  sdfSlot,
} from './cascades.ts';

type RadianceTexture = TgpuTexture<{ size: [number, number]; format: 'rgba16float' }> & StorageFlag;
type OutputResource =
  | RadianceTexture
  | TgpuTextureView<d.WgslStorageTexture2d<'rgba16float', 'write-only'>>;
type OutputSize = { width: number; height: number };

type CascadesOptions = {
  root: TgpuRoot;

  /** Signed distance in scene units: the shorter side measures 1. */
  sdf: (uv: d.v2f) => number;

  /** Emitted linear RGB; zero for an obstacle that does not emit light. */
  emission: (uv: d.v2f) => d.v3f;
  sdfResolution: { width: number; height: number };

  rayMarch?: (
    probePos: d.v2f,
    rayDir: d.v2f,
    startT: number,
    endT: number,
    eps: number,
    minStep: number,
    bias: number,
  ) => d.InferGPU<typeof RayMarchResult>;

  output?: OutputResource;
  size?: OutputSize;
  renderAspect?: number;

  /** Distances ending in Probes use the finest lighting-sample spacing as their unit. */
  erodeBiasProbes?: number;
  epsProbes?: number;
  minStepProbes?: number;

  maxRaySteps?: number;
  /** Sphere-tracing step multiplier, in `(0, 1]`. Below 1 marches more conservatively. */
  stepSafety?: number;

  /** Direction samples at the finest lighting resolution: 1 (default) → 4, 2 → 16, 4 → 64. */
  baseStoredRayDim?: BaseStoredRayDim;

  /** 'bilinear-fix' adds visibility checks to reduce light leaking at a higher tracing cost. */
  mergeMode?: MergeMode;
};

export type RadianceCascadesExecutor<
  TOutput extends OutputResource = RadianceTexture & SampledFlag,
> = {
  run(commandEncoder?: TgpuCommandEncoder): void;
  with(bindGroup: TgpuBindGroup): RadianceCascadesExecutor<TOutput>;
  destroy(): void;

  readonly output: TOutput;

  initSync(): void;

  /** Optional: prepare pipelines ahead of the first run to move compilation out of that update. */
  initAsync(): Promise<void>;
};

export function createRadianceCascades(
  options: CascadesOptions & { output?: undefined; size: OutputSize },
): RadianceCascadesExecutor;
export function createRadianceCascades<TOutput extends OutputResource>(
  options: CascadesOptions & { output: TOutput },
): RadianceCascadesExecutor<TOutput>;
export function createRadianceCascades(
  options: CascadesOptions,
): RadianceCascadesExecutor<OutputResource> {
  const { root, sdf, emission, sdfResolution, output, size, rayMarch } = options;

  const outputSize = output ? (isTexture(output) ? output.props.size : output.size) : undefined;
  const [outputWidth, outputHeight] = outputSize ?? [size?.width, size?.height];
  if (!outputWidth || !outputHeight) {
    throw new Error('Size could not be inferred from output, pass explicit size in options.');
  }
  if (!(sdfResolution.width > 0) || !(sdfResolution.height > 0)) {
    throw new Error('sdfResolution must be positive.');
  }

  const {
    mergeMode = 'hardware',
    baseStoredRayDim = 1,
    renderAspect = outputWidth / outputHeight,
    erodeBiasProbes = 1,
    epsProbes = 0.25,
    minStepProbes = 0.125,
    maxRaySteps = 64,
    stepSafety = 1,
  } = options;

  if (!(stepSafety > 0 && stepSafety <= 1)) {
    throw new Error('stepSafety must be within (0, 1] to avoid overshooting the SDF.');
  }
  if (!(maxRaySteps > 0) || !Number.isInteger(maxRaySteps)) {
    throw new Error('maxRaySteps must be a positive integer.');
  }
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

  const dst =
    output ??
    root
      .createTexture({
        size: [outputWidth, outputHeight],
        format: 'rgba16float',
      })
      .$usage('storage', 'sampled');

  const cascadeTextureA = root
    .createTexture({ size: cascadeDim, format: 'rgba16float' })
    .$usage('storage', 'sampled');
  const cascadeTextureB = root
    .createTexture({ size: cascadeDim, format: 'rgba16float' })
    .$usage('storage', 'sampled');

  const cascadeSampler = root.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const cascadePasses = layers.map((layerInfo) => {
    const { layer, validDim } = layerInfo;
    const isTopCascade = layer === cascadeCount - 1;

    const writeToA = (cascadeCount - 1 - layer) % 2 === 0;
    const dstTexture = writeToA ? cascadeTextureA : cascadeTextureB;
    const srcTexture = writeToA ? cascadeTextureB : cascadeTextureA;

    const layerParams = root.createUniform(CascadeLayerParams, {
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

    return {
      layerParams,
      bindGroup: root.createBindGroup(cascadePassBGL, {
        layerParams,
        upper: srcTexture,
        upperSampler: cascadeSampler,
        dst: dstTexture,
      }),
      workgroups: [Math.ceil(validDim[0] / 8), Math.ceil(validDim[1] / 8)] as const,
      isTopCascade,
    };
  });

  const cascadePipelineBase = root
    .with(sdfSlot, sdf)
    .with(emissionSlot, emission)
    .with(maxRayStepsAccess, maxRaySteps)
    .with(rayMarchStepSafetyAccess, stepSafety)
    .with(rayMarchSlot, rayMarch ?? defaultRayMarch)
    .with(mergeModeSlot, mergeMode);

  const topCascadePipeline = cascadePipelineBase
    .with(hasUpperCascadeSlot, false)
    .createComputePipeline({
      compute: cascadePassCompute,
    });

  const mergeCascadePipeline = cascadePipelineBase
    .with(hasUpperCascadeSlot, true)
    .createComputePipeline({
      compute: cascadePassCompute,
    });

  const buildRadianceFieldPipeline = root
    .with(baseStoredRayDimSlot, baseStoredRayDim)
    .createComputePipeline({
      compute: buildRadianceFieldCompute,
    });

  const buildRadianceFieldParams = root.createUniform(BuildRadianceFieldParams, {
    probes: baseProbes,
  });

  const cascade0InA = (cascadeCount - 1) % 2 === 0;
  const srcCascadeTexture = cascade0InA ? cascadeTextureA : cascadeTextureB;

  const buildRadianceFieldBG = root.createBindGroup(buildRadianceFieldBGL, {
    params: buildRadianceFieldParams,
    src: srcCascadeTexture,
    srcSampler: cascadeSampler,
    dst,
  });

  const outputWorkgroupsX = Math.ceil(outputWidth / 8);
  const outputWorkgroupsY = Math.ceil(outputHeight / 8);

  function destroy() {
    cascadeTextureA.destroy();
    cascadeTextureB.destroy();
    buildRadianceFieldParams.buffer.destroy();

    for (const { layerParams } of cascadePasses) {
      layerParams.buffer.destroy();
    }

    if (!output && isTexture(dst)) {
      dst.destroy();
    }
  }

  function createExecutor(
    additionalBindGroups: TgpuBindGroup[] = [],
  ): RadianceCascadesExecutor<OutputResource> {
    const prebuiltCascadePasses = cascadePasses
      .map(({ bindGroup, workgroups, isTopCascade }) => {
        const cascadePassPipeline = isTopCascade ? topCascadePipeline : mergeCascadePipeline;
        let pipeline = cascadePassPipeline.with(bindGroup);
        for (const addBg of additionalBindGroups) {
          pipeline = pipeline.with(addBg);
        }

        return { pipeline, workgroups };
      })
      .toReversed();

    let prebuiltRadiancePipeline = buildRadianceFieldPipeline.with(buildRadianceFieldBG);
    for (const bg of additionalBindGroups) {
      prebuiltRadiancePipeline = prebuiltRadiancePipeline.with(bg);
    }

    function run(commandEncoder?: TgpuCommandEncoder) {
      const encoder = commandEncoder ?? root['~unstable'].createCommandEncoder();
      const pass = encoder.beginComputePass();

      for (const { pipeline, workgroups } of prebuiltCascadePasses) {
        pipeline.with(pass).dispatchWorkgroups(...workgroups);
      }

      prebuiltRadiancePipeline.with(pass).dispatchWorkgroups(outputWorkgroupsX, outputWorkgroupsY);
      pass.end();

      if (!commandEncoder) {
        encoder.submit();
      }
    }

    const pipelines = [
      ...prebuiltCascadePasses.map(({ pipeline }) => pipeline),
      prebuiltRadiancePipeline,
    ];

    return {
      run,
      with: (bg) => createExecutor([...additionalBindGroups, bg]),
      destroy,
      output: dst,
      initSync: () => pipelines.forEach((pipeline) => pipeline.initSync()),
      initAsync: () =>
        Promise.all(pipelines.map((pipeline) => pipeline.initAsync())).then(() => {}),
    };
  }

  return createExecutor();
}
