import tgpu from 'typegpu';
import { randf } from '@typegpu/noise';
import * as d from 'typegpu/data';

import { Distribution, PlotType, type PRNG } from './types.ts';

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
  // [Distribution.BERNOULLI]: randf.bernoulli,

  // [Distribution.SAMPLE_EXCLUSIVE]: randf.sampleExclusive,
  // [Distribution.EXPONENTIAL]: randf.exponential,
  // [Distribution.NORMAL]: randf.normal,
  // [Distribution.CAUCHY]: randf.cauchy,
} as const;

export function getPRNG(distribution: Distribution): PRNG {
  return distributionPRNGs[distribution];
}
