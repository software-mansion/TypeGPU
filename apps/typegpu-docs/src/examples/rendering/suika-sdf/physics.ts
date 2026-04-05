import RAPIER from '@dimforge/rapier2d-compat';

export interface BallState {
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  angle: number;
}

export interface MergeEvent {
  handleA: number;
  handleB: number;
  level: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
}

export interface PhysicsWorld {
  step(
    dt: number,
    mergeDistFactor: number,
    pullActivationFactor: number,
    pullForce: number,
    maxLevel: number,
  ): MergeEvent[];
  getBallState(handle: number): BallState | null;
  addBall(
    x: number,
    y: number,
    radius: number,
    contour: Float32Array,
    level: number,
    vx?: number,
    vy?: number,
    angle?: number,
  ): number;
  removeBall(handle: number): void;
}

// Fruit levels 0–9 use collision bits 0–9; walls use bit 10 to collide with all
const WALL_BIT = 10;

export async function createPhysicsWorld(
  walls: { cx: number; cy: number; hw: number; hh: number }[],
): Promise<PhysicsWorld> {
  await RAPIER.init();

  const world = new RAPIER.World({ x: 0, y: -1.9 });

  const wallGroup = ((1 << WALL_BIT) << 16) | 0xffff;
  for (const { cx, cy, hw, hh } of walls) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hw, hh)
        .setTranslation(cx, cy)
        .setRestitution(0.2)
        .setFriction(0.6)
        .setCollisionGroups(wallGroup),
    );
  }

  const ballBodies: (RAPIER.RigidBody | null)[] = [];
  const ballLevels: number[] = [];
  const ballRadii: number[] = [];

  function applyPullAssist(
    mergeDistFactor: number,
    pullActivationFactor: number,
    pullForce: number,
  ) {
    const count = ballBodies.length;
    for (let i = 0; i < count; i++) {
      const bodyA = ballBodies[i];
      if (!bodyA) {
        continue;
      }
      const levelA = ballLevels[i];
      const radiusA = ballRadii[i];
      const mergeDist = radiusA * mergeDistFactor;
      const pullStart = mergeDist * pullActivationFactor;
      const mergeDistSq = mergeDist * mergeDist;
      const pullStartSq = pullStart * pullStart;
      const pullRange = pullStart - mergeDist;
      const posA = bodyA.translation();
      const velA = bodyA.linvel();

      for (let j = i + 1; j < count; j++) {
        const bodyB = ballBodies[j];
        if (!bodyB || ballLevels[j] !== levelA) {
          continue;
        }

        const posB = bodyB.translation();
        const dx = posB.x - posA.x;
        const dy = posB.y - posA.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= mergeDistSq || distSq >= pullStartSq) {
          continue;
        }
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;

        const velB = bodyB.linvel();
        const dvx = velB.x - velA.x;
        const dvy = velB.y - velA.y;
        if (-(dvx * nx + dvy * ny) > 0.05) {
          continue;
        }

        const impulse = (1 - (dist - mergeDist) / pullRange) * pullForce;
        bodyA.applyImpulse({ x: nx * impulse, y: ny * impulse }, true);
        bodyB.applyImpulse({ x: -nx * impulse, y: -ny * impulse }, true);
      }
    }
  }

  function detectMerges(mergeDistFactor: number, maxLevel: number): MergeEvent[] {
    const merges: MergeEvent[] = [];
    const count = ballBodies.length;
    for (let i = 0; i < count; i++) {
      const bodyA = ballBodies[i];
      if (!bodyA || ballLevels[i] >= maxLevel) {
        continue;
      }
      const levelA = ballLevels[i];
      const mergeDist = ballRadii[i] * mergeDistFactor;
      const mergeDistSq = mergeDist * mergeDist;
      const posA = bodyA.translation();

      for (let j = i + 1; j < count; j++) {
        const bodyB = ballBodies[j];
        if (!bodyB || ballLevels[j] !== levelA) {
          continue;
        }
        const posB = bodyB.translation();
        const dx = posA.x - posB.x;
        const dy = posA.y - posB.y;
        if (dx * dx + dy * dy >= mergeDistSq) {
          continue;
        }

        const velA = bodyA.linvel();
        const velB = bodyB.linvel();
        const angA = bodyA.rotation();
        const angB = bodyB.rotation();

        merges.push({
          handleA: i,
          handleB: j,
          level: levelA,
          x: (posA.x + posB.x) * 0.5,
          y: (posA.y + posB.y) * 0.5,
          vx: (velA.x + velB.x) * 0.5,
          vy: (velA.y + velB.y) * 0.5,
          angle: Math.atan2(Math.sin(angA) + Math.sin(angB), Math.cos(angA) + Math.cos(angB)),
        });

        world.removeRigidBody(bodyA);
        world.removeRigidBody(bodyB);
        ballBodies[i] = null;
        ballBodies[j] = null;
        break;
      }
    }
    return merges;
  }

  return {
    step(dt, mergeDistFactor, pullActivationFactor, pullForce, maxLevel) {
      applyPullAssist(mergeDistFactor, pullActivationFactor, pullForce);
      world.timestep = dt;
      world.step();
      return detectMerges(mergeDistFactor, maxLevel);
    },

    getBallState(handle: number): BallState | null {
      const body = ballBodies[handle];
      if (!body) {
        return null;
      }
      return {
        pos: body.translation(),
        vel: body.linvel(),
        angle: body.rotation(),
      };
    },

    addBall(x, y, radius, contour, level, vx = 0, vy = 0, angle = 0): number {
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y).setLinvel(vx, vy).setRotation(angle),
      );

      // Same-level fruits don't collide with each other
      const group = ((1 << level) << 16) | (0xffff ^ (1 << level));
      world.createCollider(
        (
          RAPIER.ColliderDesc.convexHull(contour.map((v) => v * radius)) ??
          RAPIER.ColliderDesc.ball(radius)
        )
          .setRestitution(0.2)
          .setFriction(0.1)
          .setCollisionGroups(group),
        body,
      );

      ballBodies.push(body);
      ballLevels.push(level);
      ballRadii.push(radius);
      return ballBodies.length - 1;
    },

    removeBall(handle: number) {
      const body = ballBodies[handle];
      if (body) {
        world.removeRigidBody(body);
        ballBodies[handle] = null;
      }
    },
  };
}
