import {
  randFloat01,
  randInUnitCircle,
  randInUnitCube,
  randOnUnitHemisphere,
  randOnUnitSphere,
} from './random.js';

export const rand: {
  float01: typeof randFloat01;
  inUnitCircle: typeof randInUnitCircle;
  inUnitCube: typeof randInUnitCube;
  onHemisphere: typeof randOnUnitHemisphere;
  onUnitSphere: typeof randOnUnitSphere;
} = {
  float01: randFloat01,
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
