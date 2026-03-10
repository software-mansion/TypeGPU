import { d, type TgpuRoot } from 'typegpu';
import type { Chunk } from './schemas.ts';
import RAPIER from '@dimforge/rapier3d-compat';
import { ChunkGenerator } from './chunkGenerator.ts';

export class Player {
  constructor(public pos: d.v3f) {}
}

export class Map {
  chunks: Chunk[] = [];
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
          this.chunks.push(await chunkGenerator.generateChunk(d.vec3i(x, y, z)));
        }
      }
    }
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
  map: Map;

  world: RAPIER.World;
  playerPidController: RAPIER.PidController;
  // voxels: RAPIER.RigidBody;

  constructor(config: Config, world: RAPIER.World) {
    this.player = new Player(config.playerPos);
    const { xRange, yRange, zRange } = config.chunks;
    this.map = new Map(xRange, yRange, zRange);
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
    await this.map.initChunks(root);
  }

  getPlayerChunk(): Chunk {
    return null as unknown as Chunk;
  }
}
