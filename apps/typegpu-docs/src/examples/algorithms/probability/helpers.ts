import tgpu, { d } from 'typegpu';
import { BPETER, LCG, randf, type StatefulGenerator } from '@typegpu/noise';
import { Distribution, Generator, PlotType, type PRNG } from './types.ts';
import * as c from './constants.ts';

const normal = d.vec3f(1.41, 1.41, 0);
const z2D = 0.5;

const distributionPRNGs = {
  [Distribution.IN_UNIT_SPHERE]: {
    plotType: PlotType.GEOMETRIC,
    prng: randf.inUnitSphere,
    origin: d.vec3f(),
  },
  [Distribution.ON_UNIT_SPHERE]: {
    plotType: PlotType.GEOMETRIC,
    prng: randf.onUnitSphere,
    origin: d.vec3f(),
  },
  [Distribution.IN_UNIT_CIRCLE]: {
    plotType: PlotType.GEOMETRIC,
    prng: tgpu.fn([], d.vec3f)(() => d.vec3f(randf.inUnitCircle(), z2D)),
    origin: d.vec3f(),
  },
  [Distribution.ON_UNIT_CIRCLE]: {
    plotType: PlotType.GEOMETRIC,
    prng: tgpu.fn([], d.vec3f)(() => d.vec3f(randf.onUnitCircle(), z2D)),
    origin: d.vec3f(),
  },
  [Distribution.IN_UNIT_CUBE]: {
    plotType: PlotType.GEOMETRIC,
    prng: randf.inUnitCube,
    origin: d.vec3f(0.5),
  },
  [Distribution.ON_UNIT_CUBE]: {
    plotType: PlotType.GEOMETRIC,
    prng: randf.onUnitCube,
    origin: d.vec3f(0.5),
  },
  [Distribution.IN_HEMISPHERE]: {
    plotType: PlotType.GEOMETRIC,
    prng: tgpu.fn([], d.vec3f)(() => randf.inHemisphere(normal)),
    origin: d.vec3f(),
  },
  [Distribution.ON_HEMISPHERE]: {
    plotType: PlotType.GEOMETRIC,
    prng: tgpu.fn([], d.vec3f)(() => randf.onHemisphere(normal)),
    origin: d.vec3f(),
  },
  [Distribution.BERNOULLI]: {
    plotType: PlotType.DISCRETE,
    prng: tgpu.fn([], d.vec3f)(() => d.vec3f(randf.bernoulli(0.7))),
  },
  [Distribution.SAMPLE]: {
    plotType: PlotType.CONTINUOUS,
    prng: tgpu.fn([], d.vec3f)(() => d.vec3f(randf.sample())),
  },
  [Distribution.EXPONENTIAL]: {
    plotType: PlotType.CONTINUOUS,
    prng: tgpu.fn([], d.vec3f)(() => d.vec3f(randf.exponential(1))),
  },
  [Distribution.NORMAL]: {
    plotType: PlotType.CONTINUOUS,
    prng: tgpu.fn([], d.vec3f)(() => d.vec3f(randf.normal(0, 1))),
  },
  [Distribution.CAUCHY]: {
    plotType: PlotType.CONTINUOUS,
    prng: tgpu.fn([], d.vec3f)(() => d.vec3f(randf.cauchy(0, 1))),
  },
} as const;

export function getPRNG(distribution: Distribution): PRNG {
  return distributionPRNGs[distribution];
}

const distributionCameras = {
  [Distribution.IN_UNIT_SPHERE]: c.cameraPositionGeo,
  [Distribution.ON_UNIT_SPHERE]: c.cameraPositionGeo,
  [Distribution.IN_UNIT_CIRCLE]: c.cameraPositionGeo,
  [Distribution.ON_UNIT_CIRCLE]: c.cameraPositionGeo,
  [Distribution.IN_UNIT_CUBE]: c.cameraPositionGeo,
  [Distribution.ON_UNIT_CUBE]: c.cameraPositionGeo,
  [Distribution.IN_HEMISPHERE]: c.cameraPositionGeo,
  [Distribution.ON_HEMISPHERE]: c.cameraPositionGeo,

  [Distribution.BERNOULLI]: c.cameraPositionHist,

  [Distribution.SAMPLE]: c.cameraPositionHist,
  [Distribution.EXPONENTIAL]: c.cameraPositionHist,
  [Distribution.NORMAL]: c.cameraPositionHist,
  [Distribution.CAUCHY]: c.cameraPositionHist,
} as const;

export function getCameraPosition(distribution: Distribution): number[] {
  return distributionCameras[distribution];
}

const GENERATOR_MAP = {
  [Generator.BPETER]: BPETER,
  [Generator.LCG]: LCG,
};

export const getGenerator = (gen: Generator): StatefulGenerator =>
  GENERATOR_MAP[gen];
