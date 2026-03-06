import { d } from 'typegpu';
import type { Chunk, VoxelInstance } from './schemas.ts';
import { chunkToInstanceData, generateChunk } from './chunkGenerator.ts';
import RAPIER from '@dimforge/rapier3d-compat';

export class Player {
  constructor(public pos: d.v3f) {}
}

export class Map {
  chunks: Chunk[] = [];
  constructor(xRange: d.v2i, yRange: d.v2i, zRange: d.v2i) {
    for (let x = xRange[0]; x <= xRange[1]; x++) {
      for (let y = yRange[0]; y <= yRange[1]; y++) {
        for (let z = zRange[0]; z <= zRange[1]; z++) {
          this.chunks.push(generateChunk(d.vec3i(x, y, z)));
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

  getVoxelsData(): d.Infer<typeof VoxelInstance>[] {
    return this.map.chunks.flatMap(chunkToInstanceData);
  }

  getPlayerChunk(): Chunk {
    return null as unknown as Chunk;
  }
}
