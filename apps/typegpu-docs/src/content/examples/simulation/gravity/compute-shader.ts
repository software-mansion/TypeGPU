import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { G } from './env';
import { CelestialBodyStruct, celestialBodyLayout } from './schemas';

const celestialBodiesBindGroup = celestialBodyLayout.bound;

export const computeShader = tgpu['~unstable']
  .computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [1],
  })
  .does((input) => {
    const dt = 0.016;

    const objectState = celestialBodiesBindGroup.inState.value[input.gid.x];
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
      const distance = std.length(position);
      const acceleration =
        (-G * mass * normDirection[i]) / (distance * distance);
      position[i] =
        position[i] + velocity[i] * dt + 0.5 * acceleration * dt * dt;
      velocity[i] = velocity[i] + acceleration * dt;
      velocity[i] = velocity[i] * 0.99; // damping
    }

    modelMatrix = std.identity();
    modelMatrix = std.translate(modelMatrix, position);

    celestialBodiesBindGroup.outState.value[input.gid.x] = CelestialBodyStruct({
      position: position,
      velocity: velocity,
      mass: mass,
      modelMatrix: modelMatrix,
    });
  })
  .$name('cube physics compute shader');
