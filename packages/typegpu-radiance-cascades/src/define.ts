import type { d, TgpuComputePipeline, TgpuRoot } from 'typegpu';
import type { BaseStoredRayDim, MergeMode } from './layout.ts';
import {
  baseStoredRayDimSlot,
  buildRadianceFieldBGL,
  buildRadianceFieldCompute,
  BuildRadianceFieldParams,
  CascadeLayerParams,
  cascadePassBGL,
  cascadePassCompute,
  defaultRayMarch,
  emissionSlot,
  hasUpperCascadeSlot,
  maxRayStepsAccess,
  mergeModeSlot,
  rayMarchSlot,
  rayMarchStepSafetyAccess,
  type RayMarchResult,
  sdfSlot,
} from './shader.ts';

/**
 * Options that change the generated shaders.
 * @category Module
 */
export type RadianceCascadesOptions = {
  /** Signed distance in scene units: the shorter side measures 1. */
  sdf: (uv: d.v2f) => number;

  /** Emitted linear RGB; zero for an obstacle that does not emit light. */
  emission: (uv: d.v2f) => d.v3f;

  rayMarch?: (
    probePos: d.v2f,
    rayDir: d.v2f,
    startT: number,
    endT: number,
    eps: number,
    minStep: number,
    bias: number,
  ) => d.InferGPU<typeof RayMarchResult>;

  maxRaySteps?: number;
  /** Sphere-tracing step multiplier, in `(0, 1]`. Below 1 marches more conservatively. */
  stepSafety?: number;

  /** Direction samples at the finest lighting resolution: 1 (default) → 4, 2 → 16, 4 → 64. */
  baseStoredRayDim?: BaseStoredRayDim;

  /** 'bilinear-fix' adds visibility checks to reduce light leaking at a higher tracing cost. */
  mergeMode?: MergeMode;
};

/**
 * Pipelines, layouts and schemas of the SDF runner. Plain data, built by `define`.
 * @category Module
 */
export type RadianceCascadesDefinition = {
  readonly baseStoredRayDim: BaseStoredRayDim;
  readonly layouts: {
    readonly cascadePass: typeof cascadePassBGL;
    readonly buildRadianceField: typeof buildRadianceFieldBGL;
  };
  readonly schemas: {
    readonly CascadeLayerParams: typeof CascadeLayerParams;
    readonly BuildRadianceFieldParams: typeof BuildRadianceFieldParams;
  };
  readonly pipelines: {
    /** Traces the topmost cascade, which has no upper cascade to merge with. */
    readonly topCascade: TgpuComputePipeline;
    /** Traces one cascade and merges it with the one above. */
    readonly mergeCascade: TgpuComputePipeline;
    /** Builds the output radiance field from cascade 0. */
    readonly buildRadianceField: TgpuComputePipeline;
  };
};

/**
 * Builds the pipelines of the SDF runner. Sizes and textures go to `instantiate`.
 * @category Module
 */
export function define(
  root: TgpuRoot,
  options: RadianceCascadesOptions,
): RadianceCascadesDefinition {
  const {
    sdf,
    emission,
    rayMarch,
    mergeMode = 'hardware',
    baseStoredRayDim = 1,
    maxRaySteps = 64,
    stepSafety = 1,
  } = options;

  if (!(stepSafety > 0 && stepSafety <= 1)) {
    throw new Error('stepSafety must be within (0, 1] to avoid overshooting the SDF.');
  }
  if (!(maxRaySteps > 0) || !Number.isInteger(maxRaySteps)) {
    throw new Error('maxRaySteps must be a positive integer.');
  }

  const cascadeRoot = root
    .with(sdfSlot, sdf)
    .with(emissionSlot, emission)
    .with(maxRayStepsAccess, maxRaySteps)
    .with(rayMarchStepSafetyAccess, stepSafety)
    .with(rayMarchSlot, rayMarch ?? defaultRayMarch)
    .with(mergeModeSlot, mergeMode);

  return {
    baseStoredRayDim,
    layouts: {
      cascadePass: cascadePassBGL,
      buildRadianceField: buildRadianceFieldBGL,
    },
    schemas: { CascadeLayerParams, BuildRadianceFieldParams },
    pipelines: {
      topCascade: cascadeRoot
        .with(hasUpperCascadeSlot, false)
        .createComputePipeline({ compute: cascadePassCompute }),
      mergeCascade: cascadeRoot
        .with(hasUpperCascadeSlot, true)
        .createComputePipeline({ compute: cascadePassCompute }),
      buildRadianceField: root
        .with(baseStoredRayDimSlot, baseStoredRayDim)
        .createComputePipeline({ compute: buildRadianceFieldCompute }),
    },
  };
}
