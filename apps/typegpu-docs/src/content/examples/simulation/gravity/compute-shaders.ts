import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { G } from './env';
import { CelectialBodyStruct, celestialBodyLayout } from './structs';

const celestialBodiesBindGroup = celestialBodyLayout.bound;

export const computeShader = tgpu['~unstable']
  .computeFn({
    workgroupSize: [1],
  })
  .does(() => {
    const dt = 0.016;

    for (
      let index = 0;
      index < d.i32(std.arrayLength(celestialBodiesBindGroup.inState.value));
      index++
    ) {
      const objectState = celestialBodiesBindGroup.inState.value[index];
      const position = objectState.position;
      const velocity = objectState.velocity;
      const mass = objectState.mass;
      let modelMatrix = objectState.modelMatrix;

      let normDirection = d.vec3f();
      if (std.length(position) !== 0) {
        normDirection = std.normalize(position);
      } else {
        normDirection = d.vec3f(0, 0, 0);
      }

      for (let i = 0; i < 3; i++) {
        velocity[i] = velocity[i] + -G * normDirection[i] * dt;
        position[i] = position[i] + velocity[i] * dt;
        velocity[i] = velocity[i] * 0.99; // damping
      }

      modelMatrix = std.identity();
      modelMatrix = std.translate(modelMatrix, position);

      celestialBodiesBindGroup.outState.value[index] = CelectialBodyStruct({
        position: position,
        velocity: velocity,
        mass: mass,
        modelMatrix: modelMatrix,
      });
    }
  })
  .$name('cube physics compute shader');
