import { d, std } from 'typegpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { CHUNK_SIZE, INIT_CONFIG } from './params.ts';
import type { MovementInput } from './thirdPersonCamera.ts';
import type { Config } from './schemas.ts';

const TICK_RATE = 1 / 20; // 20 ticks per second

export class Player {
  body: RAPIER.RigidBody;
  controller: RAPIER.KinematicCharacterController;
  dims: d.v2f;

  prevPos = d.vec3f();
  currPos = d.vec3f();
  velocity = d.vec3f();
  grounded = false;
  tickAccum = 0;

  constructor(config: Config, world: RAPIER.World) {
    this.dims = config.playerDims;

    const playerDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(config.playerPos.x, config.playerPos.y, config.playerPos.z)
      .lockRotations()
      .setLinearDamping(0)
      .setCcdEnabled(true);
    this.body = world.createRigidBody(playerDesc);

    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      config.playerDims.x,
      config.playerDims.y,
      config.playerDims.x,
    );
    world.createCollider(colliderDesc, this.body);

    this.controller = world.createCharacterController(0.01);
    this.controller.enableAutostep(0.6, 0.6, false);
    this.controller.setUp({ x: 0, y: 1, z: 0 });

    const p = this.body.translation();
    this.prevPos = d.vec3f(p.x, p.y, p.z);
    this.currPos = d.vec3f(p.x, p.y, p.z);
  }

  get position(): d.v3f {
    return this.prevPos.add(this.currPos.sub(this.prevPos).mul(this.tickAccum / TICK_RATE));
  }

  getCurrentChunk(): d.v3i {
    return d.vec3i(this.position.div(CHUNK_SIZE));
  }

  #tick(input: MovementInput, yaw: number) {
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const rot = d.mat2x2f(sin, cos, -cos, sin);
    let vel = rot.mul(d.vec2f(input.forward, input.right));
    const norm = std.length(vel);
    if (norm > 0) {
      vel = std.normalize(vel);
    }

    const M = norm > 0 ? 1 : 0;

    // https://www.mcpk.wiki/wiki/Horizontal_Movement_Formulas
    if (this.grounded) {
      this.velocity.x = this.velocity.x * 0.6 * 0.91 + 0.1 * M * vel.x;
      this.velocity.z = this.velocity.z * 0.6 * 0.91 + 0.1 * M * vel.y;

      if (input.jump) {
        this.velocity.y = 0.42;
      } else {
        this.velocity.y = -0.08;
      }
    } else {
      this.velocity.x = this.velocity.x * 0.91 + 0.02 * M * vel.x;
      this.velocity.z = this.velocity.z * 0.91 + 0.02 * M * vel.y;
      this.velocity.y = (this.velocity.y - 0.08) * 0.98;
    }

    this.controller.computeColliderMovement(this.body.collider(0), {
      x: this.velocity.x,
      y: this.velocity.y,
      z: this.velocity.z,
    });

    const corrected = this.controller.computedMovement();

    this.grounded = this.velocity.y < 0 && corrected.y > this.velocity.y;

    if (this.grounded) {
      this.velocity.y = 0;
    }

    const pos = this.body.translation();
    this.prevPos = d.vec3f(pos.x, pos.y, pos.z);
    this.body.setNextKinematicTranslation({
      x: pos.x + corrected.x,
      y: pos.y + corrected.y,
      z: pos.z + corrected.z,
    });
    this.currPos = d.vec3f(pos.x + corrected.x, pos.y + corrected.y, pos.z + corrected.z);
  }

  step(input: MovementInput, yaw: number, dt: number) {
    this.tickAccum += dt;
    while (this.tickAccum >= TICK_RATE) {
      this.#tick(input, yaw);
      this.tickAccum -= TICK_RATE;
    }
    // `this.tickAccum` always less than `TICK_RATE`, we can lerp `pos` with it
    if (this.position.y < CHUNK_SIZE * (INIT_CONFIG.chunks.yRange.x + 1) + this.dims.y) {
      this.body.setTranslation(
        {
          x: INIT_CONFIG.playerPos.x,
          y: INIT_CONFIG.playerPos.y,
          z: INIT_CONFIG.playerPos.z,
        },
        true,
      );
    }
  }
}
