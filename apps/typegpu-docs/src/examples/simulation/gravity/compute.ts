import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { collisionBehaviors } from './enums.ts';
import { radiusOf } from './helpers.ts';
import { CelestialBody, computeLayout, timeAccess } from './schemas.ts';

const { none, bounce, merge } = collisionBehaviors;

// tiebreaker function for merges and bounces
const isSmaller = tgpu.fn([d.u32, d.u32], d.bool)((currentId, otherId) => {
  if (
    computeLayout.$.inState[currentId].mass <
      computeLayout.$.inState[otherId].mass
  ) {
    return true;
  }
  if (
    computeLayout.$.inState[currentId].mass ===
      computeLayout.$.inState[otherId].mass
  ) {
    return currentId < otherId;
  }
  return false;
});

export const computeCollisionsShader = tgpu['~unstable'].computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [1],
})((input) => {
  const currentId = input.gid.x;
  // TODO: replace it with struct copy when Chromium is fixed
  const current = CelestialBody({
    position: computeLayout.$.inState[currentId].position,
    velocity: computeLayout.$.inState[currentId].velocity,
    mass: computeLayout.$.inState[currentId].mass,
    collisionBehavior: computeLayout.$.inState[currentId].collisionBehavior,
    textureIndex: computeLayout.$.inState[currentId].textureIndex,
    radiusMultiplier: computeLayout.$.inState[currentId].radiusMultiplier,
    ambientLightFactor: computeLayout.$.inState[currentId].ambientLightFactor,
    destroyed: computeLayout.$.inState[currentId].destroyed,
  });

  const updatedCurrent = current;
  if (current.destroyed === 0) {
    for (let i = 0; i < computeLayout.$.celestialBodiesCount; i++) {
      const otherId = d.u32(i);
      // TODO: replace it with struct copy when Chromium is fixed
      const other = CelestialBody({
        position: computeLayout.$.inState[otherId].position,
        velocity: computeLayout.$.inState[otherId].velocity,
        mass: computeLayout.$.inState[otherId].mass,
        collisionBehavior: computeLayout.$.inState[otherId].collisionBehavior,
        textureIndex: computeLayout.$.inState[otherId].textureIndex,
        radiusMultiplier: computeLayout.$.inState[otherId].radiusMultiplier,
        ambientLightFactor: computeLayout.$.inState[otherId].ambientLightFactor,
        destroyed: computeLayout.$.inState[otherId].destroyed,
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

  computeLayout.$.outState[input.gid.x] = updatedCurrent;
});

export const computeGravityShader = tgpu['~unstable'].computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [1],
})((input) => {
  // TODO: replace it with struct copy when Chromium is fixed
  const current = CelestialBody({
    position: computeLayout.$.inState[input.gid.x].position,
    velocity: computeLayout.$.inState[input.gid.x].velocity,
    mass: computeLayout.$.inState[input.gid.x].mass,
    collisionBehavior: computeLayout.$.inState[input.gid.x].collisionBehavior,
    textureIndex: computeLayout.$.inState[input.gid.x].textureIndex,
    radiusMultiplier: computeLayout.$.inState[input.gid.x].radiusMultiplier,
    ambientLightFactor: computeLayout.$.inState[input.gid.x].ambientLightFactor,
    destroyed: computeLayout.$.inState[input.gid.x].destroyed,
  });
  const dt = timeAccess.$.passed * timeAccess.$.multiplier;

  const updatedCurrent = current;
  if (current.destroyed === 0) {
    for (let i = 0; i < computeLayout.$.celestialBodiesCount; i++) {
      // TODO: replace it with struct copy when Chromium is fixed
      const other = CelestialBody({
        position: computeLayout.$.inState[i].position,
        velocity: computeLayout.$.inState[i].velocity,
        mass: computeLayout.$.inState[i].mass,
        collisionBehavior: computeLayout.$.inState[i].collisionBehavior,
        textureIndex: computeLayout.$.inState[i].textureIndex,
        radiusMultiplier: computeLayout.$.inState[i].radiusMultiplier,
        ambientLightFactor: computeLayout.$.inState[i].ambientLightFactor,
        destroyed: computeLayout.$.inState[i].destroyed,
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

  computeLayout.$.outState[input.gid.x] = updatedCurrent;
});
