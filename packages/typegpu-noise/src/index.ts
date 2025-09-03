import {
  randFloat01,
  randInUnitCircle,
  randInUnitCube,
  randOnUnitHemisphere,
  randOnUnitSphere,
  randSeed,
  randSeed2,
  randSeed3,
  randSeed4,
} from './random.ts';

export const randf: {
  seed: typeof randSeed;
  seed2: typeof randSeed2;
  seed3: typeof randSeed3;
  seed4: typeof randSeed4;
  sample: typeof randFloat01;
  inUnitCircle: typeof randInUnitCircle;
  inUnitCube: typeof randInUnitCube;
  onHemisphere: typeof randOnUnitHemisphere;
  onUnitSphere: typeof randOnUnitSphere;
} = {
  seed: randSeed,
  seed2: randSeed2,
  seed3: randSeed3,
  seed4: randSeed4,
  sample: randFloat01,
  inUnitCircle: randInUnitCircle,
  inUnitCube: randInUnitCube,
  onHemisphere: randOnUnitHemisphere,
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
