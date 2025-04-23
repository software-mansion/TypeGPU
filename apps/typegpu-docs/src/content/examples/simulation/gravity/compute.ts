import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  computeCollisionsBindGroupLayout as collisionsLayout,
  computeGravityBindGroupLayout as gravityLayout,
} from './schemas.ts';
import { radiusOf } from './textures.ts';

export const computeGravityShader = tgpu['~unstable']
  .computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [1],
  })((input) => {
    const current = gravityLayout.$.inState[input.gid.x];
    const dt = 0.016;

    const updatedCurrent = current;
    if (current.destroyed === 0) {
      for (let i = 0; i < gravityLayout.$.celestialBodiesCount; i++) {
        const other = gravityLayout.$.inState[i];
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
    }

    gravityLayout.$.outState[input.gid.x] = updatedCurrent;
  })
  .$name('Compute gravity shader');

const isSmaller = tgpu['~unstable'].fn(
  { currentId: d.u32, otherId: d.u32 },
  d.bool,
)((args) => {
  const current = collisionsLayout.$.inState[args.currentId];
  const other = collisionsLayout.$.inState[args.otherId];
  if (current.mass < other.mass) {
    return true;
  }
  if (current.mass === other.mass) {
    return args.currentId < args.otherId;
  }
  return false;
});

export const computeCollisionsShader = tgpu['~unstable']
  .computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [1],
  })((input) => {
    const currentId = input.gid.x;
    const current = collisionsLayout.$.inState[currentId];

    const updatedCurrent = current;
    if (current.destroyed === 0) {
      // collisions
      for (let i = 0; i < collisionsLayout.$.celestialBodiesCount; i++) {
        const otherId = d.u32(i);
        const other = collisionsLayout.$.inState[otherId];
        if (d.u32(i) === input.gid.x || other.destroyed === 1) {
          continue;
        }

        const dist = std.distance(current.position, other.position);
        // are bodies disjoint?
        if (dist >= radiusOf(current.mass) + radiusOf(other.mass)) {
          continue;
        }
        // is the collision skipped?
        if (current.collisionBehavior === 0 || other.collisionBehavior === 0) {
          continue;
        }
        // does bounce occur?
        if (current.collisionBehavior === 1 && other.collisionBehavior === 1) {
          // bounce with tiny damping
          updatedCurrent.velocity = std.mul(
            0.99,
            std.sub(
              updatedCurrent.velocity,
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
          // push the smaller object outside
          if (
            current.mass < other.mass ||
            (current.mass === other.mass && input.gid.x < d.u32(i))
          ) {
            updatedCurrent.position = std.add(
              other.position,
              std.mul(
                radiusOf(current.mass) + radiusOf(other.mass),
                std.normalize(std.sub(current.position, other.position)),
              ),
            );
          }
          continue;
        }
        // does merge occur?
        if (current.collisionBehavior === 2 || other.collisionBehavior === 2) {
          const isCurrentAbsorbed =
            current.collisionBehavior === 1 ||
            (current.collisionBehavior === 2 &&
              isSmaller({ currentId: currentId, otherId: otherId }));
          if (isCurrentAbsorbed) {
            // absorbed by other
            updatedCurrent.destroyed = 1;
            break;
          }
          // absorbs other
          updatedCurrent.mass += other.mass;
        }
      }
    }

    collisionsLayout.$.outState[input.gid.x] = updatedCurrent;
  })
  .$name('Compute collisions shader');
