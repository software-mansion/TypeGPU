import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { randf } from '@typegpu/noise';

const Boid = d.struct({
  pos: d.vec3f,
});

const createRandomBoid = tgpu.fn([], Boid)(() => {
  return { pos: randf.inUnitCube() };
});

const shaderCode = tgpu.resolve([createRandomBoid]);

console.log(shaderCode);
