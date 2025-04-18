import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { CelestialBody, celestialBodiesBindGroupLayout } from './schemas.ts';
import { radiusOf } from './textures.ts';

const { inState, outState, celestialBodiesCount } =
  celestialBodiesBindGroupLayout.bound;

export const computeShader = tgpu['~unstable']
  .computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [1],
  })((input) => {
    const current = inState.value[input.gid.x];
    const dt = 0.016;

    if (current.destroyed === 1) {
      return;
    }

    const updatedCurrent = CelestialBody({
      destroyed: current.destroyed,
      position: current.position,
      velocity: current.velocity,
      mass: current.mass,
      collisionBehavior: current.collisionBehavior,
      textureIndex: current.textureIndex,
    });

    // // collisions
    // for (let i = 0; i < celestialBodiesCount.value; i++) {
    //   const other = inState.value[i];
    //   if (d.u32(i) === input.gid.x || other.destroyed === 1) {
    //     continue;
    //   }
    //   const dist = std.distance(current.position, other.position);
    //   if (dist >= radiusOf(current.mass) + radiusOf(other.mass)) {
    //     continue;
    //   }
    //   if (current.collisionBehavior === 0 || other.collisionBehavior === 0) {
    //     continue;
    //   }
    //   if (current.collisionBehavior === 1 && other.collisionBehavior === 1) {
    //     // bounce with tiny damping
    //     updatedCurrent.velocity = std.mul(
    //       0.99,
    //       std.sub(
    //         updatedCurrent.velocity,
    //         std.mul(
    //           (((2 * other.mass) / (current.mass + other.mass)) *
    //             std.dot(
    //               std.sub(current.velocity, other.velocity),
    //               std.sub(current.position, other.position),
    //             )) /
    //             std.pow(std.distance(current.position, other.position), 2),
    //           std.sub(current.position, other.position),
    //         ),
    //       ),
    //     );
    //     // push the smaller object outside
    //     if (current.mass < other.mass) {
    //       updatedCurrent.position = std.add(
    //         other.position,
    //         std.mul(
    //           radiusOf(current.mass) + radiusOf(other.mass),
    //           std.normalize(std.sub(current.position, other.position)),
    //         ),
    //       );
    //     }
    //     continue;
    //   }
    //   if (current.collisionBehavior === 1) {
    //     // absorbed by other
    //     updatedCurrent.destroyed = 1;
    //     outState.value[input.gid.x] = updatedCurrent;
    //     return;
    //   }
    //   // absorbs other
    //   updatedCurrent.mass += other.mass;
    // }

    // gravity
    for (let i = 0; i < celestialBodiesCount.value; i++) {
      const other = inState.value[i];
      if (d.u32(i) === input.gid.x || other.destroyed === 1) {
        continue;
      }

      const dist = std.max(
        radiusOf(current.mass) + radiusOf(other.mass),
        std.distance(current.position, other.position),
      );
      const gravityForce = (current.mass * other.mass) / dist / dist;

      const direction = std.normalize(
        std.sub(other.position, current.position),
      );
      updatedCurrent.velocity = std.add(
        updatedCurrent.velocity,
        std.mul((gravityForce / current.mass) * dt, direction),
      );
    }

    updatedCurrent.position = std.add(
      updatedCurrent.position,
      std.mul(dt, updatedCurrent.velocity),
    );

    outState.value[input.gid.x] = updatedCurrent;
  })
  .$name('Compute shader');
