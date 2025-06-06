import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { collisionBehaviors } from './enums.ts';
import { radiusOf } from './helpers.ts';
import {
  CelestialBody,
  computeCollisionsBindGroupLayout as collisionsLayout,
  computeGravityBindGroupLayout as gravityLayout,
} from './schemas.ts';

const { none, bounce, merge } = collisionBehaviors;

// tiebreaker function for merges and bounces
const isSmaller = tgpu['~unstable'].fn([d.u32, d.u32], d.bool)(
  (currentId, otherId) => {
    if (
      collisionsLayout.$.inState[currentId].mass <
        collisionsLayout.$.inState[otherId].mass
    ) {
      return true;
    }
    if (
      collisionsLayout.$.inState[currentId].mass ===
        collisionsLayout.$.inState[otherId].mass
    ) {
      return currentId < otherId;
    }
    return false;
  },
).$name('isSmaller');

export const computeCollisionsShader = tgpu['~unstable']
  .computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [1],
  })((input) => {
    const currentId = input.gid.x;
    // TODO: replace it with struct copy when Chromium is fixed
    const current = CelestialBody({
      position: collisionsLayout.$.inState[currentId].position,
      velocity: collisionsLayout.$.inState[currentId].velocity,
      mass: collisionsLayout.$.inState[currentId].mass,
      collisionBehavior:
        collisionsLayout.$.inState[currentId].collisionBehavior,
      textureIndex: collisionsLayout.$.inState[currentId].textureIndex,
      radiusMultiplier: collisionsLayout.$.inState[currentId].radiusMultiplier,
      ambientLightFactor:
        collisionsLayout.$.inState[currentId].ambientLightFactor,
      destroyed: collisionsLayout.$.inState[currentId].destroyed,
    });

    const updatedCurrent = current;
    if (current.destroyed === 0) {
      for (let i = 0; i < collisionsLayout.$.celestialBodiesCount; i++) {
        const otherId = d.u32(i);
        // TODO: replace it with struct copy when Chromium is fixed
        const other = CelestialBody({
          position: collisionsLayout.$.inState[otherId].position,
          velocity: collisionsLayout.$.inState[otherId].velocity,
          mass: collisionsLayout.$.inState[otherId].mass,
          collisionBehavior:
            collisionsLayout.$.inState[otherId].collisionBehavior,
          textureIndex: collisionsLayout.$.inState[otherId].textureIndex,
          radiusMultiplier:
            collisionsLayout.$.inState[otherId].radiusMultiplier,
          ambientLightFactor:
            collisionsLayout.$.inState[otherId].ambientLightFactor,
          destroyed: collisionsLayout.$.inState[otherId].destroyed,
        });
        // no collision occurs...
        if (
          d.u32(i) === input.gid.x || // ...with itself
          other.destroyed === 1 || // ...when other is destroyed
          current.collisionBehavior === none || // ...when current behavior is none
          other.collisionBehavior === none || // ...when other behavior is none
          std.distance(current.position, other.position) >=
            radiusOf(current) + radiusOf(other) // ...when other is too far away
        ) {
          continue;
        }

        // if we got here, a collision occurs
        if (
          current.collisionBehavior === bounce &&
          other.collisionBehavior === bounce
        ) {
          // bounce occurs
          // push the smaller object outside
          if (isSmaller(currentId, otherId)) {
            updatedCurrent.position = std.add(
              other.position,
              std.mul(
                radiusOf(current) + radiusOf(other),
                std.normalize(std.sub(current.position, other.position)),
              ),
            );
          }
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
        } else {
          // merge occurs
          const isCurrentAbsorbed = current.collisionBehavior === bounce ||
            (current.collisionBehavior === merge &&
              isSmaller(currentId, otherId));
          if (isCurrentAbsorbed) {
            // absorbed by the other
            updatedCurrent.destroyed = 1;
          } else {
            // absorbs the other
            const m1 = updatedCurrent.mass;
            const m2 = other.mass;
            updatedCurrent.velocity = std.add(
              std.mul(m1 / (m1 + m2), updatedCurrent.velocity),
              std.mul(m2 / (m1 + m2), other.velocity),
            );
            updatedCurrent.mass = m1 + m2;
          }
        }
      }
    }

    collisionsLayout.$.outState[input.gid.x] = updatedCurrent;
  })
  .$name('collisions');

export const computeGravityShader = tgpu['~unstable']
  .computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [1],
  })((input) => {
    // TODO: replace it with struct copy when Chromium is fixed
    const current = CelestialBody({
      position: gravityLayout.$.inState[input.gid.x].position,
      velocity: gravityLayout.$.inState[input.gid.x].velocity,
      mass: gravityLayout.$.inState[input.gid.x].mass,
      collisionBehavior: gravityLayout.$.inState[input.gid.x].collisionBehavior,
      textureIndex: gravityLayout.$.inState[input.gid.x].textureIndex,
      radiusMultiplier: gravityLayout.$.inState[input.gid.x].radiusMultiplier,
      ambientLightFactor:
        gravityLayout.$.inState[input.gid.x].ambientLightFactor,
      destroyed: gravityLayout.$.inState[input.gid.x].destroyed,
    });
    const dt = gravityLayout.$.time.passed * gravityLayout.$.time.multiplier;

    const updatedCurrent = current;
    if (current.destroyed === 0) {
      for (let i = 0; i < gravityLayout.$.celestialBodiesCount; i++) {
        // TODO: replace it with struct copy when Chromium is fixed
        const other = CelestialBody({
          position: gravityLayout.$.inState[i].position,
          velocity: gravityLayout.$.inState[i].velocity,
          mass: gravityLayout.$.inState[i].mass,
          collisionBehavior: gravityLayout.$.inState[i].collisionBehavior,
          textureIndex: gravityLayout.$.inState[i].textureIndex,
          radiusMultiplier: gravityLayout.$.inState[i].radiusMultiplier,
          ambientLightFactor: gravityLayout.$.inState[i].ambientLightFactor,
          destroyed: gravityLayout.$.inState[i].destroyed,
        });

        if (d.u32(i) === input.gid.x || other.destroyed === 1) {
          continue;
        }

        const dist = std.max(
          radiusOf(current) + radiusOf(other),
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
  .$name('gravity');
