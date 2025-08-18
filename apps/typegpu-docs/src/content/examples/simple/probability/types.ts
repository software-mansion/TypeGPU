import type { TgpuFn } from 'typegpu';
import type * as d from 'typegpu/data';

export const PlotType = {
  GEOMETRIC: 0,
  HISTOGRAM: 1,
  BAR: 2,
} as const;

export type PlotType = typeof PlotType[keyof typeof PlotType];

export interface PlotData {
  count: number;
  ids: Uint32Array;
  positionsX: Float64Array;
  positionsY: Float64Array;
  positionsZ: Float64Array;
  sizes: Float64Array;
  dists: Float64Array;
}

export const ExecutionMode = {
  SINGLE: 'single',
  PARALLEL: 'parallel',
} as const;

export type ExecutionMode = typeof ExecutionMode[keyof typeof ExecutionMode];

export const Distribution = {
  IN_UNIT_SPHERE: 'inUnitSphere',
  ON_UNIT_SPHERE: 'onUnitSphere',
  IN_UNIT_CIRCLE: 'inUnitCircle',
  ON_UNIT_CIRCLE: 'onUnitCircle',
  IN_UNIT_CUBE: 'inUnitCube',
  ON_UNIT_CUBE: 'onUnitCube',
  IN_HEMISPHERE: 'inHemisphere',
  ON_HEMISPHERE: 'onHemisphere',
  // BERNOULLI: 'bernoulli',

  // SAMPLE: 'sample',
  // SAMPLE_EXCLUSIVE: 'sampleExclusive',
  // EXPONENTIAL: 'exponential',
  // NORMAL: 'normal',
  // CAUCHY: 'cauchy',
} as const;

export type Distribution = typeof Distribution[keyof typeof Distribution];

export type PRNG =
  & { plotType: PlotType }
  & (GeometricPRNG);

export interface GeometricPRNG {
  prng: TgpuFn<() => d.Vec3f>;
  origin: d.v3f;
}
