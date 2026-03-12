import { d, type TgpuRoot } from 'typegpu';
import type { Chunk } from './schemas.ts';
import RAPIER from '@dimforge/rapier3d-compat';
import { ChunkGenerator, coordToIndexCPU } from './chunkGenerator.ts';

export class Player {
  constructor(public pos: d.v3f) {}
}

export class WorldMap {
  #chunks: Map<string, Chunk> = new Map();
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
          this.#chunks.set(chunkPos.toString(), chunk);
          this.#dirtyChunks.add(chunk);
        }
      }
    }
  }

  updateBlock(chunkPos: d.v3i, blockPos: d.v3i, newBlock: number) {
    const chunk = this.#chunks.get(chunkPos.toString());
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
  chunks: {
    xRange: d.v2i;
    yRange: d.v2i;
    zRange: d.v2i;
  };
}

export class State {
  player: Player;
  worldMap: WorldMap;

  world: RAPIER.World;
  playerPidController: RAPIER.PidController;
  // voxels: RAPIER.RigidBody;

  constructor(config: Config, world: RAPIER.World) {
    this.player = new Player(config.playerPos);
    const { xRange, yRange, zRange } = config.chunks;
    this.worldMap = new WorldMap(xRange, yRange, zRange);
    this.world = world;

    // rapier
    const characterDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(config.playerPos.x, config.playerPos.y, config.playerPos.z)
      .setGravityScale(10.0)
      .setSoftCcdPrediction(10.0);
    const character = world.createRigidBody(characterDesc);
    const characterColliderDesc = RAPIER.ColliderDesc.capsule(1, 0.5);
    world.createCollider(characterColliderDesc, character);

    this.playerPidController = world.createPidController(60.0, 0.0, 1.0, RAPIER.PidAxesMask.AllAng);
  }

  async init(root: TgpuRoot) {
    await this.worldMap.initChunks(root);
  }

  getPlayerChunk(): Chunk {
    return null as unknown as Chunk;
  }
}
