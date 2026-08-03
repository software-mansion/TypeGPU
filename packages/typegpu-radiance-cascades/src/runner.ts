import {
  d,
  isTexture,
  isTextureView,
  type SampledFlag,
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuRoot,
  type TgpuTexture,
  type TgpuTextureView,
} from 'typegpu';
import {
  type BaseStoredRayDim,
  buildRadianceFieldBGL,
  cascadePassBGL,
  CascadeLayerParams,
  colorSlot,
  defaultRayMarch,
  defaultTraceSegment,
  getCascadeInfo,
  makeBuildRadianceFieldCompute,
  makeCascadePassCompute,
  maxRayStepsAccess,
  type MergeMode,
  rayMarchStepSafetyAccess,
  type RayMarchResult,
  rayMarchSlot,
  sdfSlot,
  traceSegmentSlot,
} from './cascades.ts';

type RadianceTexture2D = TgpuTexture<{ size: [number, number]; format: 'rgba16float' }>;
type RadianceTextureArray = TgpuTexture<{
  size: [number, number, number];
  format: 'rgba16float';
}>;
type RadianceStorageView = TgpuTextureView<d.WgslStorageTexture2d<'rgba16float', 'write-only'>>;

type OutputTexture = (RadianceTexture2D & StorageFlag) | RadianceStorageView;

type CascadeTexture2D = RadianceTexture2D & StorageFlag & SampledFlag;
type CascadeTextureArray = RadianceTextureArray & StorageFlag & SampledFlag;

type CascadeTexture = CascadeTexture2D | CascadeTextureArray;
type OutputSize = { width: number; height: number };

type CascadesOptions = {
  root: TgpuRoot;
  sdf: (uv: d.v2f) => number;
  color: (uv: d.v2f) => d.v3f;
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
  traceSegment?: (
    p0: d.v2f,
    p1: d.v2f,
    aspect: number,
    eps: number,
    minStep: number,
    bias: number,
  ) => d.InferGPU<typeof RayMarchResult>;
  output?: OutputTexture;
  size?: OutputSize;
  renderAspect?: number;
  /** Tuning distances below are expressed in base-cascade probe spacings. */
  erodeBiasProbes?: number;
  epsProbes?: number;
  minStepProbes?: number;
  maxRaySteps?: number;
  /** Sphere-tracing step multiplier, in `(0, 1]`. Below 1 marches more conservatively. */
  stepSafety?: number;
  intervalOverlapProbes?: number | 'upperProbeSpacing';
  baseStoredRayDim?: BaseStoredRayDim;
  mergeMode?: MergeMode;
  keepCascadeLayers?: boolean;
};

export type RadianceCascadesExecutor<TOutput extends OutputTexture = OutputTexture> = {
  run(commandEncoder?: GPUCommandEncoder): void;
  with(bindGroup: TgpuBindGroup): RadianceCascadesExecutor<TOutput>;
  destroy(): void;
  readonly output: TOutput;
  readonly outputTexture: CascadeTexture2D | undefined;
  readonly ownsOutput: boolean;

  /**
   * Eagerly initializes every pipeline by calling `initSync` on each.
   * Calling this is optional.
   */
  initSync(): void;
  /**
   * Eagerly initializes every pipeline by calling `initAsync` on each.
   * Calling this is optional.
   */
  initAsync(): Promise<void>;
};

export type OwnedRadianceCascadesExecutor = RadianceCascadesExecutor<CascadeTexture2D> & {
  readonly outputTexture: CascadeTexture2D;
  readonly ownsOutput: true;
};

function assertPositiveOption(name: string, value: number) {
  if (!(value > 0)) {
    throw new Error(`${name} must be positive.`);
  }
}

function assertNonNegativeOption(name: string, value: number) {
  if (value < 0) {
    throw new Error(`${name} must be non-negative.`);
  }
}

function assertStepSafety(value: number) {
  if (!(value > 0) || value > 1) {
    throw new Error('stepSafety must be within (0, 1], values above 1 overshoot the SDF bound.');
  }
}

function getOutputSize(output: OutputTexture | undefined, size: OutputSize | undefined) {
  if (output === undefined) {
    if (!size) {
      throw new Error('Size is required when output texture is not provided.');
    }
    return [size.width, size.height] as const;
  }

  if (isTexture(output)) {
    return output.props.size;
  }

  const [width, height] = output.size ?? [size?.width, size?.height];
  if (!width || !height) {
    throw new Error('Size could not be inferred from texture view, pass explicit size in options.');
  }
  return [width, height] as const;
}

function createCascadeTexture(
  root: TgpuRoot,
  cascadeDimX: number,
  cascadeDimY: number,
  cascadeCount: number,
  keepCascadeLayers: boolean,
): CascadeTexture {
  if (keepCascadeLayers) {
    return root
      .createTexture({
        size: [cascadeDimX, cascadeDimY, cascadeCount],
        format: 'rgba16float',
      })
      .$usage('storage', 'sampled');
  }

  return root
    .createTexture({
      size: [cascadeDimX, cascadeDimY],
      format: 'rgba16float',
    })
    .$usage('storage', 'sampled');
}

function createCascadeSampleView(
  texture: CascadeTexture,
  layer: number,
  keepCascadeLayers: boolean,
) {
  if (keepCascadeLayers) {
    return (texture as CascadeTextureArray).createView(d.texture2d(d.f32), {
      baseArrayLayer: layer,
      arrayLayerCount: 1,
    });
  }

  return (texture as CascadeTexture2D).createView(d.texture2d(d.f32));
}

function createCascadeStorageView(
  texture: CascadeTexture,
  layer: number,
  keepCascadeLayers: boolean,
) {
  if (keepCascadeLayers) {
    return (texture as CascadeTextureArray).createView(d.textureStorage2d('rgba16float'), {
      baseArrayLayer: layer,
      arrayLayerCount: 1,
    });
  }

  return (texture as CascadeTexture2D).createView(d.textureStorage2d('rgba16float'));
}

export function createRadianceCascades(
  options: CascadesOptions & { output?: undefined; size: OutputSize },
): OwnedRadianceCascadesExecutor;
export function createRadianceCascades<TOutput extends OutputTexture>(
  options: CascadesOptions & { output: TOutput },
): RadianceCascadesExecutor<TOutput>;
export function createRadianceCascades(options: CascadesOptions): RadianceCascadesExecutor {
  const { root, sdf, color, sdfResolution, output, size, rayMarch, traceSegment } = options;

  if (output !== undefined && !isTexture(output) && !isTextureView(output)) {
    throw new Error('output must be a TypeGPU texture or texture view.');
  }

  const [outputWidth, outputHeight] = getOutputSize(output, size);

  if (!(sdfResolution.width > 0) || !(sdfResolution.height > 0)) {
    throw new Error('sdfResolution must be positive.');
  }

  const mergeMode = options.mergeMode ?? 'hardware';
  const keepCascadeLayers = options.keepCascadeLayers ?? false;
  const baseStoredRayDim = options.baseStoredRayDim ?? 2;
  const renderAspect = options.renderAspect ?? outputWidth / outputHeight;
  const erodeBiasProbes = options.erodeBiasProbes ?? 1;
  const epsProbes = options.epsProbes ?? 0.25;
  const minStepProbes = options.minStepProbes ?? 0.125;
  const maxRaySteps = Math.floor(options.maxRaySteps ?? 64);
  const stepSafety = options.stepSafety ?? 1;
  const intervalOverlapProbes = options.intervalOverlapProbes ?? 0;

  assertPositiveOption('renderAspect', renderAspect);
  assertNonNegativeOption('erodeBiasProbes', erodeBiasProbes);
  assertNonNegativeOption('epsProbes', epsProbes);
  assertNonNegativeOption('minStepProbes', minStepProbes);
  assertPositiveOption('maxRaySteps', maxRaySteps);
  assertStepSafety(stepSafety);
  if (typeof intervalOverlapProbes === 'number') {
    assertNonNegativeOption('intervalOverlapProbes', intervalOverlapProbes);
  }

  const dst =
    output ??
    root
      .createTexture({
        size: [outputWidth, outputHeight],
        format: 'rgba16float',
      })
      .$usage('storage', 'sampled');

  const ownsOutput = output === undefined;

  const {
    baseProbes: [cascadeProbesX, cascadeProbesY],
    cascadeDim: [cascadeDimX, cascadeDimY],
    cascadeCount,
    layers,
  } = getCascadeInfo(outputWidth, outputHeight, { baseStoredRayDim });
  const cascadeProbesMin = Math.min(cascadeProbesX, cascadeProbesY);
  const sdfTexelSizeMin = 1 / Math.max(Math.min(sdfResolution.width, sdfResolution.height), 1);
  const epsUv = Math.max(sdfTexelSizeMin, epsProbes / cascadeProbesMin);
  const minStepUv = Math.max(sdfTexelSizeMin * 0.5, minStepProbes / cascadeProbesMin);
  const hitBiasUv = erodeBiasProbes / cascadeProbesMin;

  const cascadeTextureA = createCascadeTexture(
    root,
    cascadeDimX,
    cascadeDimY,
    cascadeCount,
    keepCascadeLayers,
  );

  const cascadeTextureB = createCascadeTexture(
    root,
    cascadeDimX,
    cascadeDimY,
    cascadeCount,
    keepCascadeLayers,
  );

  const cascadeSampler = root.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const cascadePasses = layers.map((layerInfo) => {
    const { layer, validDim } = layerInfo;
    const isTopCascade = layer === cascadeCount - 1;
    const intervalOverlapUv = isTopCascade
      ? 0
      : typeof intervalOverlapProbes === 'number'
        ? intervalOverlapProbes / cascadeProbesMin
        : 1 / Math.min(layerInfo.probesU[0], layerInfo.probesU[1]);
    const writeToA = (cascadeCount - 1 - layer) % 2 === 0;
    const dstTexture = writeToA ? cascadeTextureA : cascadeTextureB;
    const srcTexture = writeToA ? cascadeTextureB : cascadeTextureA;
    const layerParams = root
      .createBuffer(CascadeLayerParams, {
        probes: layerInfo.probes,
        probesU: layerInfo.probesU,
        validDim: layerInfo.validDim,
        raysDimActual: layerInfo.raysDimActual,
        startUv: layerInfo.startUv,
        endUv: layerInfo.endUv,
        intervalOverlapUv,
      })
      .$usage('uniform');

    return {
      layerParams,
      bindGroup: root.createBindGroup(cascadePassBGL, {
        layerParams,
        upper: createCascadeSampleView(
          srcTexture,
          Math.min(layer + 1, cascadeCount - 1),
          keepCascadeLayers,
        ),
        upperSampler: cascadeSampler,
        dst: createCascadeStorageView(dstTexture, layer, keepCascadeLayers),
      }),
      workgroups: [Math.ceil(validDim[0] / 8), Math.ceil(validDim[1] / 8)] as const,
      isTopCascade,
    };
  });

  const cascadePipelineBase = root
    .with(sdfSlot, sdf)
    .with(colorSlot, color)
    .with(maxRayStepsAccess, maxRaySteps)
    .with(rayMarchStepSafetyAccess, stepSafety)
    .with(rayMarchSlot, rayMarch ?? defaultRayMarch)
    .with(traceSegmentSlot, traceSegment ?? defaultTraceSegment);

  const cascadePassSpecialization = {
    mergeMode,
    renderAspect,
    epsUv,
    minStepUv,
    hitBiasUv,
  };

  const topCascadePipeline = cascadePipelineBase.createComputePipeline({
    compute: makeCascadePassCompute({
      ...cascadePassSpecialization,
      hasUpperCascade: false,
    }),
  });

  const mergeCascadePipeline = cascadePipelineBase.createComputePipeline({
    compute: makeCascadePassCompute({
      ...cascadePassSpecialization,
      hasUpperCascade: true,
    }),
  });

  const buildRadianceFieldPipeline = root.createComputePipeline({
    compute: makeBuildRadianceFieldCompute({
      baseStoredRayDim,
      cascadeProbes: [cascadeProbesX, cascadeProbesY],
    }),
  });

  const cascade0InA = (cascadeCount - 1) % 2 === 0;
  const srcCascadeTexture = cascade0InA ? cascadeTextureA : cascadeTextureB;

  const buildRadianceFieldBG = root.createBindGroup(buildRadianceFieldBGL, {
    src: createCascadeSampleView(srcCascadeTexture, 0, keepCascadeLayers),
    srcSampler: cascadeSampler,
    dst,
  });

  const outputWorkgroupsX = Math.ceil(outputWidth / 8);
  const outputWorkgroupsY = Math.ceil(outputHeight / 8);
  const outputTexture =
    isTexture(dst) && dst.usableAsSampled ? (dst as CascadeTexture2D) : undefined;

  let destroyed = false;

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;

    cascadeTextureA.destroy();
    cascadeTextureB.destroy();
    for (const { layerParams } of cascadePasses) {
      layerParams.destroy();
    }
    if (ownsOutput && isTexture(dst)) {
      dst.destroy();
    }
  }

  function createExecutor(additionalBindGroups: TgpuBindGroup[] = []): RadianceCascadesExecutor {
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

    function run(commandEncoder?: GPUCommandEncoder) {
      const encoder = commandEncoder ?? root.device.createCommandEncoder();

      for (const { pipeline, workgroups } of prebuiltCascadePasses) {
        pipeline.with(encoder).dispatchWorkgroups(...workgroups);
      }

      prebuiltRadiancePipeline
        .with(encoder)
        .dispatchWorkgroups(outputWorkgroupsX, outputWorkgroupsY);

      if (!commandEncoder) {
        root.device.queue.submit([encoder.finish()]);
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
      outputTexture,
      ownsOutput,
      initSync: () => pipelines.forEach((pipeline) => pipeline.initSync()),
      initAsync: () =>
        Promise.all(pipelines.map((pipeline) => pipeline.initAsync())).then(() => {}),
    };
  }

  return createExecutor();
}
