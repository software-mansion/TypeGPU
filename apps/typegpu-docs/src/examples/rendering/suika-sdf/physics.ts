import RAPIER, { type Vector2 } from '@dimforge/rapier2d-compat';

export interface BallState {
  pos: Vector2;
  vel: Vector2;
  angle: number;
}

export interface PhysicsWorld {
  step(dt: number): void;
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

  return {
    step(dt: number) {
      world.timestep = dt;
      world.step();
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
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, y)
          .setLinvel(vx, vy)
          .setRotation(angle),
      );

      // Same-level fruits don't collide with each other
      const group = ((1 << level) << 16) | (0xffff ^ (1 << level));
      world.createCollider(
        (RAPIER.ColliderDesc.convexHull(contour.map((v) => v * radius)) ??
          RAPIER.ColliderDesc.ball(radius))
          .setRestitution(0.2)
          .setFriction(0.1)
          .setCollisionGroups(group),
        body,
      );

      ballBodies.push(body);
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
