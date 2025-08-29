import {
  randBernoulli,
  randCauchy,
  randExponential,
  randFloat01,
  randInUnitCircle,
  randInUnitCube,
  randInUnitHemisphere,
  randInUnitSphere,
  randNormal,
  randOnUnitCircle,
  randOnUnitCube,
  randOnUnitHemisphere,
  randOnUnitSphere,
  randSeed,
  randSeed2,
  randSeed3,
  randSeed4,
  randUniformExclusive as randFloat01Exclusive,
} from './random.ts';

export const randf: {
  seed: typeof randSeed;
  seed2: typeof randSeed2;
  seed3: typeof randSeed3;
  seed4: typeof randSeed4;
  sample: typeof randFloat01;
  sampleExclusive: typeof randFloat01Exclusive;
  normal: typeof randNormal;
  exponential: typeof randExponential;
  cauchy: typeof randCauchy;
  bernoulli: typeof randBernoulli;
  inUnitCircle: typeof randInUnitCircle;
  onUnitCircle: typeof randOnUnitCircle;
  inUnitCube: typeof randInUnitCube;
  onUnitCube: typeof randOnUnitCube;
  inHemisphere: typeof randInUnitHemisphere;
  onHemisphere: typeof randOnUnitHemisphere;
  inUnitSphere: typeof randInUnitSphere;
  onUnitSphere: typeof randOnUnitSphere;
} = {
  seed: randSeed,
  seed2: randSeed2,
  seed3: randSeed3,
  seed4: randSeed4,
  sample: randFloat01,
  sampleExclusive: randFloat01Exclusive,
  normal: randNormal,
  exponential: randExponential,
  cauchy: randCauchy,
  bernoulli: randBernoulli,
  inUnitCircle: randInUnitCircle,
  onUnitCircle: randOnUnitCircle,
  inUnitCube: randInUnitCube,
  onUnitCube: randOnUnitCube,
  inHemisphere: randInUnitHemisphere,
  onHemisphere: randOnUnitHemisphere,
  inUnitSphere: randInUnitSphere,
  onUnitSphere: randOnUnitSphere,
};

export {
  // Generators
  BPETER,
  // ---
  // The default (Can change between releases to improve uniformity).
  DefaultGenerator,
  // ---
  randomGeneratorShell,
  randomGeneratorSlot,
} from './generator.ts';

export * as perlin2d from './perlin-2d/index.ts';
export * as perlin3d from './perlin-3d/index.ts';
