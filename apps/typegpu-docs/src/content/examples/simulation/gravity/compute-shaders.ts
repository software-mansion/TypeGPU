import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';
import * as std from 'typegpu/std';
import { celestialBodyBindGroup } from './structs';
import { G } from './env';
import { centerObjectBuffer } from '.';

const celestialBodiesBindGroup = celestialBodyBindGroup.bound;

export const cubeComputeShader = tgpu['~unstable']
  .computeFn({
    workgroupSize: [1, 1, 1],
  })
  .does((input) => {
    const dt = 0.016;

    const objectState = celestialBodiesBindGroup.inState.value[0];
    const position = objectState.position;
    const velocity = objectState.velocity;
    const mass = objectState.mass;
    const modelMatrix = objectState.modelMatrix;

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
    
  
    m.mat4.identity(modelMatrix);
    m.mat4.translate(modelMatrix, position, modelMatrix);
    centerObjectBuffer.write({ modelMatrix: modelMatrix });

    celestialBodiesBindGroup.outState.value[0] = {
      position: position,
      velocity: velocity,
      mass: objectState.mass,
      modelMatrix: modelMatrix,
    };
  })
  .$name('cube physics compute shader');