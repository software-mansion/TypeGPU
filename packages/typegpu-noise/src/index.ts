import {
  randBernoulli,
  randCauchy,
  randExponential,
  randFloat01,
  randInUnitCircle,
  randInUnitCube,
  randInUnitHemisphere,
  randInUnitSphere,
  randISeed,
  randISeed2,
  randISeed3,
  randISeed4,
  randNormal,
  randOnUnitCircle,
  randOnUnitCube,
  randOnUnitHemisphere,
  randOnUnitSphere,
  randSeed,
  randSeed2,
  randSeed3,
  randSeed4,
  randUniformExclusive,
} from './random.ts';

export const randf: {
  /**
   * Sets the private seed of the thread.
   * @param seed seed value to set. Check the domains of different generators' seeds at https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-noise.
   */
  seed: typeof randSeed;
  /**
   * Sets the private seed of the thread.
   * @param seed seed value to set. Check the domains of different generators' seeds at https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-noise.
   */
  seed2: typeof randSeed2;
  /**
   * Sets the private seed of the thread.
   * @param seed seed value to set. Check the domains of different generators' seeds at https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-noise.
   */
  seed3: typeof randSeed3;
  /**
   * Sets the private seed of the thread.
   * @param seed seed value to set. Check the domains of different generators' seeds at https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-noise.
   */
  seed4: typeof randSeed4;
  /**
   * Sets the private seed of the thread.
   * @param seed seed value to set. Check the domains of different generators' seeds at https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-noise.
   */
  iSeed: typeof randISeed;
  /**
   * Sets the private seed of the thread.
   * @param seed seed value to set. Check the domains of different generators' seeds at https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-noise.
   */
  iSeed2: typeof randISeed2;
  /**
   * Sets the private seed of the thread.
   * @param seed seed value to set. Check the domains of different generators' seeds at https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-noise.
   */
  iSeed3: typeof randISeed3;
  /**
   * Sets the private seed of the thread.
   * @param seed seed value to set. Check the domains of different generators' seeds at https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-noise.
   */
  iSeed4: typeof randISeed4;
  /**
   * Returns a random f32 value in [0, 1) range.
   */
  sample: typeof randFloat01;
  /**
   * Returns a random f32 value in (0, 1) range.
   */
  sampleExclusive: typeof randUniformExclusive;
  /**
   * Returns a random f32 value basen on normal (gaussian) distribution.
   * @param mu mean value.
   * @param sigma standard deviation. Must be > 0.
   */
  normal: typeof randNormal;
  /**
   * Returns a random f32 value basen on exponential distribution.
   * @param rate rate parameter. Must be > 0.
   */
  exponential: typeof randExponential;
  /**
   * Returns a random f32 value basen on cauchy distribution.
   * @param x0 location parameter.
   * @param gamma scale parameter. Must be > 0.
   */
  cauchy: typeof randCauchy;
  /**
   * Returns 1 with probability p, 0 with probability 1 - p.
   * @param p probability of sampling 1. Must be in [0, 1].
   */
  bernoulli: typeof randBernoulli;
  /**
   * Returns a random 2D vector uniformly distributed inside a unit circle.
   */
  inUnitCircle: typeof randInUnitCircle;
  /**
   * Returns a random 2D vector uniformly distributed on a unit circle.
   */
  onUnitCircle: typeof randOnUnitCircle;
  /**
   * Returns a random 3D vector uniformly distributed inside a unit cube.
   */
  inUnitCube: typeof randInUnitCube;
  /**
   * Returns a random 3D vector uniformly distributed on a unit cube.
   */
  onUnitCube: typeof randOnUnitCube;
  /**
   * Returns a random 3D vector uniformly distributed inside an upper hemisphere
   * oriented according to a given normal vector.
   * @param normal normal vector.
   */
  inHemisphere: typeof randInUnitHemisphere;
  /**
   * Returns a random 3D vector uniformly distributed on the surface of
   * an upper hemisphere oriented according to a given normal vector.
   * @param normal normal vector.
   */
  onHemisphere: typeof randOnUnitHemisphere;
  /**
   * Returns a random 3D vector uniformly distributed inside a unit sphere.
   */
  inUnitSphere: typeof randInUnitSphere;
  /**
   * Returns a random 3D vector uniformly distributed on a unit sphere.
   */
  onUnitSphere: typeof randOnUnitSphere;
} = {
  seed: randSeed,
  seed2: randSeed2,
  seed3: randSeed3,
  seed4: randSeed4,
  iSeed: randISeed,
  iSeed2: randISeed2,
  iSeed3: randISeed3,
  iSeed4: randISeed4,
  sample: randFloat01,
  sampleExclusive: randUniformExclusive,
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
  HybridTaus,
  // ---
  randomGeneratorShell,
  randomGeneratorSlot,
  type StatefulGenerator,
} from './generator.ts';

export {
  // The default generator (Can change between releases to improve uniformity).
  DefaultGenerator,
} from './generator.ts';

export * as perlin2d from './perlin-2d/index.ts';
export * as perlin3d from './perlin-3d/index.ts';
