import { d, std, type TgpuRoot } from 'typegpu';
import { perlin2d, randf } from '@typegpu/noise';
import { buildTree, TreeVertex } from './geometry.ts';
import { captureAtlas } from './impostor.ts';
import type { Terrain } from './terrain.ts';

const CELL = 8; // one tree at most per 8x8 cell
export const DRAW_DISTANCE = 620;
export const DETAIL_DISTANCE = 75; // closer than this, trees are drawn as full meshes
const GRID = Math.ceil((2 * DRAW_DISTANCE) / CELL);
const MAX_NEAR = (Math.ceil((2 * DETAIL_DISTANCE) / CELL) + 1) ** 2;
const MAX_FAR = GRID * GRID;

export const TreeInstance = d.struct({
  position: d.vec3f,
  yaw: d.f32,
  scale: d.f32,
  id: d.u32,
});

/** Mirrors the arguments of an indirect draw, with a counter the compute pass can bump. */
const DrawArgs = d.struct({
  vertexCount: d.u32,
  instanceCount: d.atomic(d.u32),
  firstVertex: d.u32,
  firstInstance: d.u32,
});

const ScatterParams = d.struct({
  originCell: d.vec2i,
  camera: d.vec3f,
});

export function createTrees(root: TgpuRoot, terrain: Terrain) {
  const vertices = buildTree();
  const meshBuffer = root
    .createBuffer(d.arrayOf(TreeVertex, vertices.length), vertices)
    .$usage('vertex');
  const atlas = captureAtlas(root, meshBuffer, vertices.length);

  const params = root.createUniform(ScatterParams);
  const nearTrees = root.createBuffer(d.arrayOf(TreeInstance, MAX_NEAR)).$usage('storage');
  const farTrees = root.createBuffer(d.arrayOf(TreeInstance, MAX_FAR)).$usage('storage');
  const nearArgs = root.createBuffer(DrawArgs).$usage('storage', 'indirect');
  const farArgs = root.createBuffer(DrawArgs).$usage('storage', 'indirect');

  const nearTreesMutable = nearTrees.as('mutable');
  const farTreesMutable = farTrees.as('mutable');
  const nearArgsMutable = nearArgs.as('mutable');
  const farArgsMutable = farArgs.as('mutable');

  /**
   * One thread per grid cell around the camera. Cells are anchored to the world, so a tree
   * keeps its spot, shape and size no matter where the camera goes.
   */
  const scatter = root.createGuardedComputePipeline((x, y) => {
    'use gpu';
    const cell = d.vec2f(params.$.originCell + d.vec2i(d.i32(x), d.i32(y)));
    randf.seed2(cell * 0.0173 + 0.31);

    // Forests come in patches, with clearings between them.
    const forest = std.smoothstep(-0.1, 0.35, perlin2d.sample(cell * (CELL / 150) + 7.7));
    if (randf.sample() > forest * 0.8) {
      return;
    }

    const xz = (cell + 0.15 + d.vec2f(randf.sample(), randf.sample()) * 0.7) * CELL;
    const distance = std.distance(xz, params.$.camera.xz);
    if (distance > DRAW_DISTANCE) {
      return;
    }
    const ground = terrain.terrainSample(xz);
    if (std.length(ground.yz) > 0.5) {
      return; // too steep for a tree to grow
    }

    const tree = TreeInstance({
      position: d.vec3f(xz.x, ground.x, xz.y),
      yaw: randf.sample() * Math.PI * 2,
      scale: 0.75 + randf.sample() * 0.6,
      id: 64 + d.u32(randf.sample() * 120),
    });

    if (distance < DETAIL_DISTANCE) {
      nearTreesMutable.$[std.atomicAdd(nearArgsMutable.$.instanceCount, 1)] = TreeInstance(tree);
    } else {
      farTreesMutable.$[std.atomicAdd(farArgsMutable.$.instanceCount, 1)] = TreeInstance(tree);
    }
  });

  function update(cameraX: number, cameraY: number, cameraZ: number) {
    nearArgs.write({
      vertexCount: vertices.length,
      instanceCount: 0,
      firstVertex: 0,
      firstInstance: 0,
    });
    farArgs.write({ vertexCount: 4, instanceCount: 0, firstVertex: 0, firstInstance: 0 });
    params.write({
      originCell: [
        Math.floor((cameraX - DRAW_DISTANCE) / CELL),
        Math.floor((cameraZ - DRAW_DISTANCE) / CELL),
      ],
      camera: [cameraX, cameraY, cameraZ],
    });
    scatter.dispatchThreads(GRID, GRID);
  }

  return {
    meshBuffer,
    atlas,
    nearTrees: nearTrees.as('readonly'),
    farTrees: farTrees.as('readonly'),
    nearArgs,
    farArgs,
    update,
  };
}

export type Trees = ReturnType<typeof createTrees>;
