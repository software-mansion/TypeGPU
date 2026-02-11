import RAPIER from '@dimforge/rapier2d-compat';

export interface BallState {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
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
  ): number;
  removeBall(handle: number): void;
}

const WALL_BIT = 10;

export async function createPhysicsWorld(
  walls: { cx: number; cy: number; hw: number; hh: number }[],
): Promise<PhysicsWorld> {
  await RAPIER.init();

  const world = new RAPIER.World({ x: 0, y: -1.9 });

  // Walls: member of group 10, collides with everything
  const wallGroup = ((1 << WALL_BIT) << 16) | 0xffff;
  for (const wall of walls) {
    const colliderDesc = RAPIER.ColliderDesc.cuboid(wall.hw, wall.hh)
      .setTranslation(wall.cx, wall.cy)
      .setRestitution(0.2)
      .setFriction(0.1)
      .setCollisionGroups(wallGroup);
    world.createCollider(colliderDesc);
  }

  const ballBodies: (RAPIER.RigidBody | null)[] = [];

  function makeBall(
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number,
    contour: Float32Array,
    level: number,
  ) {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setLinvel(vx, vy);
    const body = world.createRigidBody(bodyDesc);

    const scaled = new Float32Array(contour.length);
    for (let i = 0; i < contour.length; i++) {
      scaled[i] = contour[i] * radius;
    }

    // Same-level balls don't collide: membership = bit(level), filter = all except bit(level)
    const membership = 1 << level;
    const filter = 0xffff ^ (1 << level);
    const group = (membership << 16) | filter;

    const colliderDesc = (
      RAPIER.ColliderDesc.convexHull(scaled) ?? RAPIER.ColliderDesc.ball(radius)
    )
      .setRestitution(0.2)
      .setFriction(0.1)
      .setCollisionGroups(group);
    world.createCollider(colliderDesc, body);

    ballBodies.push(body);
  }

  return {
    step(dt: number) {
      world.timestep = dt;
      world.step();
    },
    getBallState(handle: number): BallState | null {
      const body = ballBodies[handle];
      if (!body) return null;
      const pos = body.translation();
      const vel = body.linvel();
      return {
        x: pos.x,
        y: pos.y,
        angle: body.rotation(),
        vx: vel.x,
        vy: vel.y,
      };
    },
    addBall(
      x: number,
      y: number,
      radius: number,
      contour: Float32Array,
      level: number,
      vx = 0,
      vy = 0,
    ): number {
      makeBall(x, y, vx, vy, radius, contour, level);
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
