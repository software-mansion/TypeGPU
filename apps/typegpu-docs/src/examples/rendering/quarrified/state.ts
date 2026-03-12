import { d, std, type TgpuRoot } from 'typegpu';
import type { Chunk } from './schemas.ts';
import RAPIER from '@dimforge/rapier3d-compat';
import { ChunkGenerator, coordToIndexCPU } from './chunkGenerator.ts';
import { CHUNK_SIZE, INIT_CONFIG } from './params.ts';
import type { MovementInput } from './thirdPersonCamera.ts';

export class WorldMap {
  // TODO: make it private
  chunks: Map<string, Chunk> = new Map();
  // chunks that were modified and require re-meshing
  #dirtyChunks: Set<Chunk> = new Set();
  constructor(
    public readonly xRange: d.v2i,
    public readonly yRange: d.v2i,
    public readonly zRange: d.v2i,
  ) {}

  async initChunks(root: TgpuRoot) {
    const chunkGenerator = new ChunkGenerator(root);
    for (let x = this.xRange[0]; x <= this.xRange[1]; x++) {
      for (let y = this.yRange[0]; y <= this.yRange[1]; y++) {
        for (let z = this.zRange[0]; z <= this.zRange[1]; z++) {
          const chunkPos = d.vec3i(x, y, z);
          const chunk = await chunkGenerator.generateChunk(chunkPos);
          this.chunks.set(chunkPos.toString(), chunk);
          this.#dirtyChunks.add(chunk);
        }
      }
    }
  }

  getChunk(chunkPos: d.v3i): Chunk | undefined {
    return this.chunks.get(chunkPos.toString());
  }

  updateBlock(chunkPos: d.v3i, blockPos: d.v3i, newBlock: number) {
    const chunk = this.chunks.get(chunkPos.toString());
    if (!chunk) {
      throw new Error(`World: Tried to modify chunk that has not been generated (${chunkPos}).`);
    }
    this.#dirtyChunks.add(chunk);
    chunk.blocks[coordToIndexCPU(blockPos.x, blockPos.y, blockPos.z)] = newBlock;
  }

  getAndCleanModifiedChunks(): Chunk[] {
    const chunks = [...this.#dirtyChunks];
    this.#dirtyChunks.clear();
    return chunks;
  }
}

export interface Config {
  playerPos: d.v3f;
  playerDims: d.v2f;
  chunks: {
    xRange: d.v2i;
    yRange: d.v2i;
    zRange: d.v2i;
  };
}

export class Player {
  // TODO: make it private
  body: RAPIER.RigidBody;
  controller: RAPIER.KinematicCharacterController;
  dims: d.v2f;
  velocityY: number;
  grounded = false;

  constructor(config: Config, world: RAPIER.World) {
    this.dims = config.playerDims;

    const playerDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(config.playerPos.x, config.playerPos.y, config.playerPos.z)
      .setCcdEnabled(true);
    this.body = world.createRigidBody(playerDesc);

    const colliderDesc = RAPIER.ColliderDesc.capsule(config.playerDims.x, config.playerDims.y);
    world.createCollider(colliderDesc, this.body);

    this.controller = world.createCharacterController(0.01);
    this.velocityY = 1.2 * world.gravity.y;
  }

  get position(): d.v3f {
    const pos = this.body.translation();
    return d.vec3f(pos.x, pos.y, pos.z); // center of capsule
  }

  getCurrentChunk(): d.v3i {
    return d.vec3i(this.position.div(CHUNK_SIZE));
  }

  step(input: MovementInput, yaw: number, dt: number) {
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const rightX = -forwardZ;
    const rightZ = forwardX;

    const moveX = (input.forward * forwardX + input.right * rightX) * 10;
    const moveZ = (input.forward * forwardZ + input.right * rightZ) * 10;

    this.controller.computeColliderMovement(this.body.collider(0), {
      x: moveX * dt,
      y: this.velocityY * dt,
      z: moveZ * dt,
    });

    const corrected = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();

    if (this.grounded && this.velocityY < 0) {
      console.log('LOSER');
      this.body.setTranslation(
        {
          x: INIT_CONFIG.playerPos.x,
          y: INIT_CONFIG.playerPos.y,
          z: INIT_CONFIG.playerPos.z,
        },
        true,
      );
      return;
    }

    const pos = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: pos.x + corrected.x,
      y: pos.y + corrected.y,
      z: pos.z + corrected.z,
    });
  }
}

export class State {
  worldMap: WorldMap;
  config: Config;
  player: Player;

  world: RAPIER.World;

  loadedColliderChunks: Map<string, RAPIER.RigidBody> = new Map();
  lastPlayerChunk: d.v3i;

  constructor(config: Config, world: RAPIER.World) {
    this.config = config;
    const { xRange, yRange, zRange } = config.chunks;
    this.worldMap = new WorldMap(xRange, yRange, zRange);
    this.world = world;
    this.player = new Player(config, world);
    this.lastPlayerChunk = this.player.getCurrentChunk();
  }

  async init(root: TgpuRoot) {
    await this.worldMap.initChunks(root);
    this.#updateNearbyColliders();
  }

  step(input: MovementInput, yaw: number) {
    this.player.step(input, yaw, this.world.timestep);
    this.world.step();
    this.#updateNearbyColliders();
  }

  #loadChunkColliders(key: string) {
    // double check :)
    if (this.loadedColliderChunks.has(key)) return;

    const chunk = this.worldMap.chunks.get(key);
    if (!chunk) {
      return;
    }

    const { chunkIndex, blocks } = chunk;

    const x0 = chunkIndex.x * CHUNK_SIZE;
    const y0 = chunkIndex.y * CHUNK_SIZE;
    const z0 = chunkIndex.z * CHUNK_SIZE;

    const tempPoints = [];

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let y = 0; y < CHUNK_SIZE; y++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          // TODO: hardcode somewhere air index
          if (blocks[coordToIndexCPU(x, y, z)] === 0) continue;
          tempPoints.push(x0 + x + 0.5);
          tempPoints.push(y0 + y + 0.5);
          tempPoints.push(z0 + z + 0.5);
        }
      }
    }

    const points = new Float32Array(tempPoints);
    const dims = { x: 0.5, y: 0.5, z: 0.5 };

    const bodyDesc = RAPIER.RigidBodyDesc.fixed();
    const body = this.world.createRigidBody(bodyDesc);
    const voxelsCollider = RAPIER.ColliderDesc.voxels(points, dims);
    this.world.createCollider(voxelsCollider, body);
    this.loadedColliderChunks.set(key, body);
  }

  #unloadChunkColliders(key: string) {
    const body = this.loadedColliderChunks.get(key);
    if (!body) return;
    this.world.removeRigidBody(body);
    this.loadedColliderChunks.delete(key);
  }

  // TODO: investigate why causes error `unreachable`
  #updateNearbyColliders() {
    const currentChunk = this.player.getCurrentChunk();
    if (std.allEq(this.lastPlayerChunk, currentChunk)) return;
    this.lastPlayerChunk = currentChunk;

    // TODO: check for dirty loaded chunks
    const needed = new Set<string>();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          needed.add(currentChunk.add(d.vec3i(dx, dy, dz)).toString());
        }
      }
    }

    // for (const loadedKey of this.loadedColliderChunks.keys()) {
    //   if (!needed.has(loadedKey)) {
    //     this.#unloadChunkColliders(loadedKey);
    //   }
    // }

    for (const key of needed) {
      if (!this.loadedColliderChunks.has(key)) {
        this.#loadChunkColliders(key);
      }
    }
  }
}
