import { d, type TgpuRoot } from 'typegpu';
import type { Chunk } from './schemas.ts';
import RAPIER from '@dimforge/rapier3d-compat';
import { ChunkGenerator, coordToIndexCPU } from './chunkGenerator.ts';
import { CHUNK_SIZE } from './params.ts';
import type { MovementInput } from './thirdPersonCamera.ts';

export class WorldMap {
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
      // this.velocityY = 0;
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
  lastPlayerChunkKey = '';

  constructor(config: Config, world: RAPIER.World) {
    this.config = config;
    const { xRange, yRange, zRange } = config.chunks;
    this.worldMap = new WorldMap(xRange, yRange, zRange);
    this.world = world;
    this.player = new Player(config, world);
  }

  async init(root: TgpuRoot) {
    await this.worldMap.initChunks(root);
    this.updateNearbyColliders();
  }

  step(input: MovementInput, yaw: number) {
    this.player.step(input, yaw, this.world.timestep);
    this.world.step();
    this.updateNearbyColliders();
  }

  getPlayerChunk(): Chunk | undefined {
    const pos = this.player.body.translation();
    const cx = Math.floor(pos.x / CHUNK_SIZE);
    const cy = Math.floor(pos.y / CHUNK_SIZE);
    const cz = Math.floor(pos.z / CHUNK_SIZE);
    return this.worldMap.getChunk(d.vec3i(cx, cy, cz));
  }

  private chunkKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  private loadChunkColliders(chunk: Chunk) {
    const key = this.chunkKey(chunk.chunkIndex.x, chunk.chunkIndex.y, chunk.chunkIndex.z);
    if (this.loadedColliderChunks.has(key)) return;

    const { chunkIndex, blocks } = chunk;
    const wx0 = chunkIndex.x * CHUNK_SIZE;
    const wy0 = chunkIndex.y * CHUNK_SIZE;
    const wz0 = chunkIndex.z * CHUNK_SIZE;

    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(wx0, wy0, wz0);
    const body = this.world.createRigidBody(bodyDesc);

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let y = 0; y < CHUNK_SIZE; y++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          if (blocks[coordToIndexCPU(x, y, z)] === 0) continue;
          const desc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setTranslation(
            x + 0.5,
            y + 0.5,
            z + 0.5,
          );
          this.world.createCollider(desc, body);
        }
      }
    }

    this.loadedColliderChunks.set(key, body);
  }

  private unloadChunkColliders(key: string) {
    const body = this.loadedColliderChunks.get(key);
    if (!body) return;
    this.world.removeRigidBody(body);
    this.loadedColliderChunks.delete(key);
  }

  private updateNearbyColliders() {
    const pos = this.player.body.translation();
    const cx = Math.floor(pos.x / CHUNK_SIZE);
    const cy = Math.floor(pos.y / CHUNK_SIZE);
    const cz = Math.floor(pos.z / CHUNK_SIZE);
    const key = this.chunkKey(cx, cy, cz);

    if (key === this.lastPlayerChunkKey) return;
    this.lastPlayerChunkKey = key;

    const neededKeys = new Set<string>();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          neededKeys.add(this.chunkKey(cx + dx, cy + dy, cz + dz));
        }
      }
    }

    for (const loadedKey of this.loadedColliderChunks.keys()) {
      if (!neededKeys.has(loadedKey)) {
        this.unloadChunkColliders(loadedKey);
      }
    }

    for (const chunk of this.worldMap.chunks.values()) {
      const chunkKey = this.chunkKey(chunk.chunkIndex.x, chunk.chunkIndex.y, chunk.chunkIndex.z);
      if (neededKeys.has(chunkKey) && !this.loadedColliderChunks.has(chunkKey)) {
        this.loadChunkColliders(chunk);
      }
    }
  }
}
