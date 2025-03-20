import {
  randFloat01,
  randInUnitCircle,
  randInUnitCube,
  randOnUnitHemisphere,
  randOnUnitSphere,
  randSeed,
} from './random.js';

export const randf: {
  sample: typeof randFloat01;
  seed: typeof randSeed;
  inUnitCircle: typeof randInUnitCircle;
  inUnitCube: typeof randInUnitCube;
  onHemisphere: typeof randOnUnitHemisphere;
  onUnitSphere: typeof randOnUnitSphere;
} = {
  seed: randSeed,
  sample: randFloat01,
  inUnitCircle: randInUnitCircle,
  inUnitCube: randInUnitCube,
  onHemisphere: randOnUnitHemisphere,
  onUnitSphere: randOnUnitSphere,
};

export {
  randomGeneratorShell,
  randomGeneratorSlot,
  // ---
  // Generators
  BPETER,
  // ---
  // The default (Can change between releases to improve uniformity).
  DefaultGenerator,
} from './generator.js';
