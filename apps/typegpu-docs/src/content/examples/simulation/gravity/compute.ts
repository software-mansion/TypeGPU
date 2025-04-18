import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { CelestialBody, celestialBodiesBindGroupLayout } from './schemas.ts';

const { inState, outState, celestialBodiesCount } =
  celestialBodiesBindGroupLayout.bound;

export const computeShader = tgpu['~unstable']
  .computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [1],
  })((input) => {
    const current = inState.value[input.gid.x];
    const dt = 0.016;

    let velocity = current.velocity;
    let position = current.position;

    for (let i = 0; i < celestialBodiesCount.value; i++) {
      const other = inState.value[i];
      if (d.u32(i) === input.gid.x || current.mass === 0 || other.mass === 0) {
        continue;
      }

      const dist = std.distance(current.position, other.position);
      const direction = std.normalize(
        std.sub(other.position, current.position),
      );
      const clampedDist = std.max(current.radius + other.radius, dist);
      const gravityForce =
        (current.mass * other.mass) / clampedDist / clampedDist;
      const acc = gravityForce / current.mass;

      velocity = std.add(velocity, std.mul(acc * dt, direction));

      if (dist < current.radius + other.radius) {
        velocity = std.mul(
          0.99,
          std.sub(
            velocity,
            std.mul(
              (((2 * other.mass) / (current.mass + other.mass)) *
                std.dot(
                  std.sub(current.velocity, other.velocity),
                  std.sub(current.position, other.position),
                )) /
                std.pow(std.distance(current.position, other.position), 2),
              std.sub(current.position, other.position),
            ),
          ),
        );
        if (current.radius < other.radius) {
          position = std.add(
            other.position,
            std.mul(
              (current.radius + other.radius) * 1.0,
              std.normalize(std.sub(current.position, other.position)),
            ),
          );
        }
      }
    }
    position = std.add(position, std.mul(dt, velocity));

    const updatedCurrent = CelestialBody({
      modelTransformationMatrix: current.modelTransformationMatrix,
      velocity: velocity,
      position: position,
      _acceleration: current._acceleration,
      mass: current.mass,
      radius: current.radius,
      textureIndex: current.textureIndex,
    });

    outState.value[input.gid.x] = updatedCurrent;
  })
  .$name('Compute shader');
