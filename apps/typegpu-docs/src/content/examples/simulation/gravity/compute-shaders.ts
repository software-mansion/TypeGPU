import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';
import * as std from 'typegpu/std';
import { celestialBodyBindGroup } from './structs';
import { G } from './env';

const celestialBodiesBindGroup = celestialBodyBindGroup.bound;

export const cubeComputeShader = tgpu['~unstable']
  .computeFn({
    workgroupSize: [1, 1, 1],
  })
  .does((input) => {
    const dt = 0.016;

    const cubeState = celestialBodiesBindGroup.inState.value[0];
    const position = cubeState.position;
    const velocity = cubeState.velocity;

    let normDirection = d.vec3f();
    if (std.length(position) !== 0) {
      normDirection = std.normalize(position);
    } else {
      normDirection = d.vec3f(0, 0, 0);
    } 

    for (let i = 0; i < 3; i += 1) {
      velocity[i] = velocity[i] + (-G * normDirection[i] * dt);
      position[i] = position[i] + (velocity[i] * dt);
      velocity[i] = velocity[i] * 0.99; // damping 
    }

    // m.mat4.identity(cubeModelMatrix);
    // m.mat4.translate(cubeModelMatrix, position, cubeModelMatrix);
    // objectBuffer.write({ modelMatrix: cubeModelMatrix });

    // cubeData.value.position = position;
    // cubeData.value.velocity = velocity;
  })
  .$name('cube physics compute shader');
