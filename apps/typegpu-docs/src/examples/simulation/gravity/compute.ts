import tgpu, { d, std } from 'typegpu';
import { collisionBehaviors } from './enums.ts';
import { radiusOf } from './helpers.ts';
import { CelestialBody, computeLayout, timeAccess } from './schemas.ts';

const { none, bounce, merge } = collisionBehaviors;

// tiebreaker function for merges and bounces
const isSmaller = tgpu.fn([d.u32, d.u32], d.bool)((currentId, otherId) => {
  const current = computeLayout.$.inState[currentId];
  const other = computeLayout.$.inState[otherId];

  if (current.mass < other.mass) {
    return true;
  }

  if (current.mass === other.mass) {
    return currentId < otherId;
  }

  return false;
});

export const computeCollisionsShader = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [1],
})((input) => {
  'use gpu';
  const currentId = input.gid.x;
  const current = CelestialBody(computeLayout.$.inState[currentId]);

  if (current.destroyed === 0) {
    for (
      let otherId = d.u32(0);
      otherId < d.u32(computeLayout.$.celestialBodiesCount);
      otherId++
    ) {
      const other = computeLayout.$.inState[otherId];
      if (
        otherId === currentId || // ...with itself
        other.destroyed === 1 || // ...when other is destroyed
        current.collisionBehavior === none || // ...when current behavior is none
        other.collisionBehavior === none || // ...when other behavior is none
        std.distance(current.position, other.position) >=
          radiusOf(current) + radiusOf(other) // ...when other is too far away
      ) {
        // no collision occurs...
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
          const dir = std.normalize(current.position - other.position);
          current.position = other.position +
            (dir * (radiusOf(current) + radiusOf(other)));
        }

        // bounce with tiny damping
        const posDiff = current.position - other.position;
        const velDiff = current.velocity - other.velocity;
        const posDiffFactor =
          (((2 * other.mass) / (current.mass + other.mass)) *
            std.dot(velDiff, posDiff)) / std.dot(posDiff, posDiff);

        current.velocity = (current.velocity - posDiff * posDiffFactor) * 0.99;
      } else {
        // merge occurs
        const isCurrentAbsorbed = current.collisionBehavior === bounce ||
          (current.collisionBehavior === merge &&
            isSmaller(currentId, otherId));
        if (isCurrentAbsorbed) {
          // absorbed by the other
          current.destroyed = 1;
        } else {
          // absorbs the other
          const m1 = current.mass;
          const m2 = other.mass;
          current.velocity = current.velocity * (m1 / (m1 + m2)) +
            other.velocity * (m2 / (m1 + m2));
          current.mass = m1 + m2;
        }
      }
    }
  }

  computeLayout.$.outState[currentId] = CelestialBody(current);
});

export const computeGravityShader = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [1],
})((input) => {
  'use gpu';
  const dt = timeAccess.$.passed * timeAccess.$.multiplier;
  const currentId = input.gid.x;
  const current = CelestialBody(computeLayout.$.inState[currentId]);

  if (current.destroyed === 0) {
    for (
      let otherId = d.u32(0);
      otherId < d.u32(computeLayout.$.celestialBodiesCount);
      otherId++
    ) {
      const other = computeLayout.$.inState[otherId];

      if (otherId === currentId || other.destroyed === 1) {
        continue;
      }

      const dist = std.max(
        radiusOf(current) + radiusOf(other),
        std.distance(current.position, other.position),
      );
      const gravityForce = (current.mass * other.mass) / dist / dist;

      const direction = std.normalize(other.position - current.position);
      current.velocity += direction * (gravityForce / current.mass) * dt;
    }

    current.position += current.velocity * dt;
  }

  computeLayout.$.outState[currentId] = CelestialBody(current);
});
