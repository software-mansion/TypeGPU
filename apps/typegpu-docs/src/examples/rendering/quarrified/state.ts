import { d, std, type TgpuRoot } from 'typegpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { coordToIndex } from './chunkGenerator.ts';
import { CHUNK_SIZE } from './params.ts';
import type { MovementInput } from './thirdPersonCamera.ts';
import { blockTypes } from './blockTypes.ts';
import type { Config } from './schemas.ts';
import { Player } from './player.ts';
import { WorldMap } from './worldMap.ts';

export class State {
  root: TgpuRoot;

  worldMap: WorldMap;
  config: Config;
  player: Player;

  world: RAPIER.World;

  loadedColliderChunks: Map<string, RAPIER.RigidBody> = new Map();
  lastPlayerChunk: d.v3i;

  constructor(root: TgpuRoot, config: Config, world: RAPIER.World) {
    this.root = root;
    this.config = config;
    const { xRange, yRange, zRange } = config.chunks;
    this.worldMap = new WorldMap(root, xRange, yRange, zRange);
    this.world = world;
    this.player = new Player(config, world);
    this.lastPlayerChunk = this.player.getCurrentChunk();
  }

  async init() {
    await this.worldMap.initChunks();
    this.#updateNearbyColliders();
  }

  step(input: MovementInput, yaw: number) {
    this.world.step();
    this.player.step(input, yaw, this.world.timestep);
    this.#updateNearbyColliders();
  }

  #loadChunkColliders(key: string) {
    // double check :)
    if (this.loadedColliderChunks.has(key)) {
      return;
    }

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
          if (blocks[coordToIndex(x, y, z)].blockType === blockTypes.air) {
            continue;
          }
          tempPoints.push(x0 + x);
          tempPoints.push(y0 + y);
          tempPoints.push(z0 + z);
        }
      }
    }

    const points = new Int32Array(tempPoints);
    const dims = { x: 1, y: 1, z: 1 };

    if (points.length === 0) {
      return;
    }

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

  #updateNearbyColliders() {
    const currentChunk = this.player.getCurrentChunk();

    if (std.allEq(this.lastPlayerChunk, currentChunk)) {
      return;
    }

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

    for (const loadedKey of this.loadedColliderChunks.keys()) {
      if (!needed.has(loadedKey)) {
        this.#unloadChunkColliders(loadedKey);
      }
    }

    for (const key of needed) {
      if (!this.loadedColliderChunks.has(key)) {
        this.#loadChunkColliders(key);
      }
    }
  }
}
