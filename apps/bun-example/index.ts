import tgpu, { d } from 'typegpu';
import { randf } from '@typegpu/noise';

const Boid = d.struct({
  pos: d.vec3f,
});

const createRandomBoid = () => {
  'use gpu';
  return Boid({ pos: randf.inUnitCube() });
};

const shaderCode = tgpu.resolve([createRandomBoid]);

console.log(shaderCode);
