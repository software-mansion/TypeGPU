import type { TgpuFn } from 'typegpu';
import type * as d from 'typegpu/data';

export const PlotType = {
  GEOMETRIC: 0,
  CONTINUOUS: 1,
  DISCRETE: 2,
} as const;

export type PlotType = typeof PlotType[keyof typeof PlotType];

export interface BaseData {
  count: number;
  ids: Uint32Array;
}

export interface GeometricData extends BaseData {
  positionsX: Float64Array;
  positionsY: Float64Array;
  positionsZ: Float64Array;
  dists: Float64Array;
  sizes: Float64Array;
}

export interface HistogramData extends BaseData {
  binIdsX: Uint32Array;
  binIdsZ: Uint32Array;
  values: Float64Array;
  binsX: number;
  binsZ: number;
  sizeX: number;
  sizeZ: number;
  binsWidth: number;
  minX: number;
  maxX: number;
}

export type PlotData = GeometricData | HistogramData;

export const Distribution = {
  IN_UNIT_SPHERE: 'inUnitSphere',
  ON_UNIT_SPHERE: 'onUnitSphere',
  IN_UNIT_CIRCLE: 'inUnitCircle',
  ON_UNIT_CIRCLE: 'onUnitCircle',
  IN_UNIT_CUBE: 'inUnitCube',
  ON_UNIT_CUBE: 'onUnitCube',
  IN_HEMISPHERE: 'inHemisphere',
  ON_HEMISPHERE: 'onHemisphere',

  BERNOULLI: 'bernoulli',

  SAMPLE: 'sample',
  EXPONENTIAL: 'exponential',
  NORMAL: 'normal',
  CAUCHY: 'cauchy',
} as const;

export type Distribution = typeof Distribution[keyof typeof Distribution];

export type PRNG = GeometricPRNG | SimplePRNG;

export interface GeometricPRNG {
  plotType: PlotType;
  prng: TgpuFn<() => d.Vec3f>;
  origin: d.v3f;
}

export interface SimplePRNG {
  plotType: PlotType;
  prng: TgpuFn<() => d.Vec3f>;
}

export const Generator = {
  BPETER: 'bpeter (default)',
  LCG: 'lcg',
} as const;

export type Generator = typeof Generator[keyof typeof Generator];
