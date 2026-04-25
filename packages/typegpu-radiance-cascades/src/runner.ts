import {
  isTexture,
  isTextureView,
  type SampledFlag,
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuRoot,
  type TgpuTexture,
  type TgpuTextureView,
} from 'typegpu';
import * as d from 'typegpu/data';
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
  MERGE_MODE_BILINEAR_FIX,
  MERGE_MODE_HARDWARE,
  maxRayStepsSlot,
  type MergeMode,
  rayMarchStepSafetySlot,
  renderAspectSlot,
  type RayMarchResult,
  rayMarchSlot,
  sdfResolutionSlot,
  sdfSlot,
  traceSegmentSlot,
} from './cascades.ts';

type OutputTexture =
  | (TgpuTexture<{ size: [number, number]; format: 'rgba16float' }> & StorageFlag)
  | TgpuTextureView<d.WgslStorageTexture2d<'rgba16float', 'write-only'>>;

type CascadeTexture2D = TgpuTexture<{
  size: [number, number];
  format: 'rgba16float';
}> &
  StorageFlag &
  SampledFlag;

type CascadeTextureArray = TgpuTexture<{
  size: [number, number, number];
  format: 'rgba16float';
}> &
  StorageFlag &
  SampledFlag;

type CascadeTexture = CascadeTexture2D | CascadeTextureArray;

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
  size?: { width: number; height: number };
  renderAspect?: number;
  sdfMetric?: 'short-axis-uv';
  erodeBiasPx?: number;
  epsPx?: number;
  minStepPx?: number;
  maxRaySteps?: number;
  stepSafety?: number;
  intervalOverlapPx?: number | 'upperProbeSpacing';
  baseStoredRayDim?: BaseStoredRayDim;
  preaverageRayDim?: 2;
  mergeMode?: MergeMode;
  keepCascadeLayers?: boolean;
};

type OutputTextureProp = TgpuTexture<{
  size: [number, number];
  format: 'rgba16float';
}> &
  StorageFlag &
  SampledFlag;

export type RadianceCascadesExecutor<TOutput extends OutputTexture = OutputTexture> = {
  run(commandEncoder?: GPUCommandEncoder): void;
  with(bindGroup: TgpuBindGroup): RadianceCascadesExecutor<TOutput>;
  destroy(): void;
  readonly output: TOutput;
  readonly outputTexture: OutputTextureProp | undefined;
  readonly ownsOutput: boolean;
};

export type OwnedRadianceCascadesExecutor = RadianceCascadesExecutor<OutputTextureProp> & {
  readonly outputTexture: OutputTextureProp;
  readonly ownsOutput: true;
};

function getMergeModeId(mergeMode: MergeMode) {
  switch (mergeMode) {
    case 'hardware':
      return MERGE_MODE_HARDWARE;
    case 'bilinear-fix':
      return MERGE_MODE_BILINEAR_FIX;
    default:
      throw new Error(`Unsupported radiance cascade merge mode: ${mergeMode satisfies never}`);
  }
}

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
  options: CascadesOptions & { output?: undefined },
): OwnedRadianceCascadesExecutor;
export function createRadianceCascades<TOutput extends OutputTexture>(
  options: CascadesOptions & { output: TOutput },
): RadianceCascadesExecutor<TOutput>;
export function createRadianceCascades(options: CascadesOptions): RadianceCascadesExecutor {
  const { root, sdf, color, sdfResolution, output, size, rayMarch, traceSegment } = options;

  if (output !== undefined && !isTexture(output) && !isTextureView(output)) {
    throw new Error('output must be a TypeGPU texture or texture view.');
  }

  // Determine output dimensions
  let outputWidth: number;
  let outputHeight: number;

  if (output !== undefined) {
    if (isTexture(output)) {
      [outputWidth, outputHeight] = output.props.size;
    } else {
      const viewSize = output.size ?? [size?.width, size?.height];
      if (!viewSize[0] || !viewSize[1]) {
        throw new Error(
          'Size could not be inferred from texture view, pass explicit size in options.',
        );
      }
      [outputWidth, outputHeight] = viewSize as [number, number];
    }
  } else {
    if (!size) {
      throw new Error('Size is required when output texture is not provided.');
    }
    outputWidth = size.width;
    outputHeight = size.height;
  }

  if (!(sdfResolution.width > 0) || !(sdfResolution.height > 0)) {
    throw new Error('sdfResolution must be positive.');
  }

  const sdfMetric = options.sdfMetric ?? 'short-axis-uv';
  if (sdfMetric !== 'short-axis-uv') {
    throw new Error('Only the short-axis-uv SDF metric is currently supported.');
  }

  if (options.preaverageRayDim !== undefined && options.preaverageRayDim !== 2) {
    throw new Error('Only preaverageRayDim: 2 is currently supported.');
  }

  const mergeMode = options.mergeMode ?? 'hardware';
  const mergeModeId = getMergeModeId(mergeMode);
  const keepCascadeLayers = options.keepCascadeLayers ?? false;
  const baseStoredRayDim = options.baseStoredRayDim ?? 2;
  const renderAspect = options.renderAspect ?? outputWidth / outputHeight;
  const erodeBiasPx = options.erodeBiasPx ?? 1;
  const epsPx = options.epsPx ?? 0.25;
  const minStepPx = options.minStepPx ?? 0.125;
  const maxRaySteps = Math.floor(options.maxRaySteps ?? 64);
  const stepSafety = options.stepSafety ?? 1;
  const intervalOverlapPx = options.intervalOverlapPx ?? 0;

  assertPositiveOption('renderAspect', renderAspect);
  assertNonNegativeOption('erodeBiasPx', erodeBiasPx);
  assertNonNegativeOption('epsPx', epsPx);
  assertNonNegativeOption('minStepPx', minStepPx);
  assertPositiveOption('maxRaySteps', maxRaySteps);
  assertPositiveOption('stepSafety', stepSafety);
  if (typeof intervalOverlapPx === 'number') {
    assertNonNegativeOption('intervalOverlapPx', intervalOverlapPx);
  }

  // Create or use provided output texture
  const dst =
    output !== undefined
      ? output
      : root
          .createTexture({
            size: [outputWidth, outputHeight],
            format: 'rgba16float',
          })
          .$usage('storage', 'sampled');

  const ownsOutput = output === undefined;

  const cascadeInfo = getCascadeInfo(outputWidth, outputHeight, { baseStoredRayDim });
  const [cascadeDimX, cascadeDimY] = cascadeInfo.cascadeDim;
  const [cascadeProbesX, cascadeProbesY] = cascadeInfo.baseProbes;
  const cascadeCount = cascadeInfo.cascadeCount;
  const cascadeProbesMin = Math.min(cascadeProbesX, cascadeProbesY);
  const sdfTexelSizeMin = 1 / Math.max(Math.min(sdfResolution.width, sdfResolution.height), 1);
  const epsUv = Math.max(sdfTexelSizeMin, epsPx / cascadeProbesMin);
  const minStepUv = Math.max(sdfTexelSizeMin * 0.5, minStepPx / cascadeProbesMin);
  const hitBiasUv = erodeBiasPx / cascadeProbesMin;

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

  const layerParamsBuffers = cascadeInfo.layers.map((layerInfo) => {
    let intervalOverlapUv = 0;
    if (layerInfo.layer < cascadeCount - 1) {
      intervalOverlapUv =
        typeof intervalOverlapPx === 'number'
          ? intervalOverlapPx / cascadeProbesMin
          : 1 / Math.min(layerInfo.probesU[0], layerInfo.probesU[1]);
    }

    return root
      .createBuffer(CascadeLayerParams, {
        layer: layerInfo.layer,
        probes: layerInfo.probes,
        probesU: layerInfo.probesU,
        validDim: layerInfo.validDim,
        raysDimStored: layerInfo.raysDimStored,
        raysDimActual: layerInfo.raysDimActual,
        startUv: layerInfo.startUv,
        endUv: layerInfo.endUv,
        intervalOverlapUv,
      })
      .$usage('uniform');
  });

  const cascadePipelineBase = root
    .with(sdfResolutionSlot, d.vec2u(sdfResolution.width, sdfResolution.height))
    .with(sdfSlot, sdf)
    .with(colorSlot, color)
    .with(renderAspectSlot, renderAspect)
    .with(maxRayStepsSlot, maxRaySteps)
    .with(rayMarchStepSafetySlot, stepSafety)
    .with(rayMarchSlot, rayMarch ?? defaultRayMarch)
    .with(traceSegmentSlot, traceSegment ?? defaultTraceSegment);

  const cascadePassSpecialization = {
    mergeModeId,
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

  const cascadePassBindGroups = Array.from({ length: cascadeCount }, (_, layer) => {
    const writeToA = (cascadeCount - 1 - layer) % 2 === 0;
    const dstTexture = writeToA ? cascadeTextureA : cascadeTextureB;
    const srcTexture = writeToA ? cascadeTextureB : cascadeTextureA;
    const layerParams = layerParamsBuffers[layer];

    if (!layerParams) {
      throw new Error(`Missing radiance cascade layer params for layer ${layer}.`);
    }

    return root.createBindGroup(cascadePassBGL, {
      layerParams,
      upper: createCascadeSampleView(
        srcTexture,
        Math.min(layer + 1, cascadeCount - 1),
        keepCascadeLayers,
      ),
      upperSampler: cascadeSampler,
      dst: createCascadeStorageView(dstTexture, layer, keepCascadeLayers),
    });
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

  const cascadeDispatches = cascadeInfo.layers.map(({ validDim }) => ({
    workgroupsX: Math.ceil(validDim[0] / 8),
    workgroupsY: Math.ceil(validDim[1] / 8),
  }));
  const outputWorkgroupsX = Math.ceil(outputWidth / 8);
  const outputWorkgroupsY = Math.ceil(outputHeight / 8);
  const outputTexture =
    isTexture(dst) && dst.usableAsSampled ? (dst as OutputTextureProp) : undefined;

  let destroyed = false;

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;

    cascadeTextureA.destroy();
    cascadeTextureB.destroy();
    for (const layerParamsBuffer of layerParamsBuffers) {
      layerParamsBuffer.destroy();
    }
    if (ownsOutput && isTexture(dst)) {
      dst.destroy();
    }
  }

  function createExecutor(additionalBindGroups: TgpuBindGroup[] = []): RadianceCascadesExecutor {
    const prebuiltCascadePipelines = cascadePassBindGroups.map((bg, layer) => {
      const cascadePassPipeline =
        layer === cascadeCount - 1 ? topCascadePipeline : mergeCascadePipeline;
      let p = cascadePassPipeline.with(bg);
      for (const addBg of additionalBindGroups) {
        p = p.with(addBg);
      }
      return p;
    });

    let prebuiltRadiancePipeline = buildRadianceFieldPipeline.with(buildRadianceFieldBG);
    for (const bg of additionalBindGroups) {
      prebuiltRadiancePipeline = prebuiltRadiancePipeline.with(bg);
    }

    function run(commandEncoder?: GPUCommandEncoder) {
      const encoder = commandEncoder ?? root.device.createCommandEncoder();

      for (let layer = cascadeCount - 1; layer >= 0; layer--) {
        const dispatch = cascadeDispatches[layer];
        if (!dispatch) {
          throw new Error(`Missing radiance cascade dispatch dimensions for layer ${layer}.`);
        }
        prebuiltCascadePipelines[layer]
          ?.with(encoder)
          .dispatchWorkgroups(dispatch.workgroupsX, dispatch.workgroupsY);
      }

      prebuiltRadiancePipeline
        .with(encoder)
        .dispatchWorkgroups(outputWorkgroupsX, outputWorkgroupsY);

      if (!commandEncoder) {
        root.device.queue.submit([encoder.finish()]);
      }
    }

    return {
      run,
      with: (bg) => createExecutor([...additionalBindGroups, bg]),
      destroy,
      output: dst,
      outputTexture,
      ownsOutput,
    };
  }

  return createExecutor();
}
