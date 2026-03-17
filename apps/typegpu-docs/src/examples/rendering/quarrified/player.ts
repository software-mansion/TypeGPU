import { d } from 'typegpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { CHUNK_SIZE } from './params.ts';
import type { MovementInput } from './thirdPersonCamera.ts';
import type { Config } from './schemas.ts';

export class Player {
  // TODO: make it private
  body: RAPIER.RigidBody;
  controller: RAPIER.KinematicCharacterController;
  dims: d.v2f;
  velocityY: number;

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

    this.velocityY = world.gravity.y;
  }

  get position(): d.v3f {
    const pos = this.body.translation();
    return d.vec3f(pos.x, pos.y, pos.z);
  }

  getCurrentChunk(): d.v3i {
    return d.vec3i(this.position.div(CHUNK_SIZE));
  }

  step(input: MovementInput, yaw: number, dt: number) {
    // --- debug ---
    const p = this.position;
    console.log('Player Pos:', p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2));
    // --- debug end ---

    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const rightX = -forwardZ;
    const rightZ = forwardX;

    const moveX = (input.forward * forwardX + input.right * rightX) * 10;
    const moveZ = (input.forward * forwardZ + input.right * rightZ) * 10;

    // --- debug ---
    if (input.jump) {
      this.velocityY = 10;
    } else {
      this.velocityY = -10;
    }
    // --- debug end ---

    this.controller.computeColliderMovement(this.body.collider(0), {
      x: moveX * dt,
      y: this.velocityY * dt,
      z: moveZ * dt,
    });

    const corrected = this.controller.computedMovement();

    // if (this.grounded && this.velocityY < 0) {
    //   console.log('LOSER');
    //   this.body.setTranslation(
    //     {
    //       x: INIT_CONFIG.playerPos.x,
    //       y: INIT_CONFIG.playerPos.y,
    //       z: INIT_CONFIG.playerPos.z,
    //     },
    //     true,
    //   );
    //   return;
    // }

    const pos = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: pos.x + corrected.x,
      y: pos.y + corrected.y,
      z: pos.z + corrected.z,
    });
  }
}
