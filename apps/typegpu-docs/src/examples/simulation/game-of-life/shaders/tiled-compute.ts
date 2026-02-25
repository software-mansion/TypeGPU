import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import tgpu from 'typegpu';
import {
  computeLayout,
  gameSizeAccessor,
  golNextState,
  TILE_SIZE,
} from './common.ts';

const HALO = 1;
const SHARED_SIZE = TILE_SIZE + 2 * HALO;
const GATHER_SIZE = SHARED_SIZE / 2;

const sharedTile = tgpu.workgroupVar(
  d.arrayOf(d.u32, SHARED_SIZE * SHARED_SIZE),
);

const tileIdx = (x: number, y: number) => {
  'use gpu';
  return y * SHARED_SIZE + x;
};

const readTile = (x: number, y: number): number => {
  'use gpu';
  return sharedTile.$[tileIdx(x, y)];
};

const countNeighborsInTile = (x: number, y: number): number => {
  'use gpu';
  // oxfmt-ignore
  return readTile(x - 1, y - 1) + readTile(x, y - 1) + readTile(x + 1, y - 1) +
         readTile(x - 1, y)                                + readTile(x + 1, y) +
         readTile(x - 1, y + 1) + readTile(x, y + 1) + readTile(x + 1, y + 1);
};

export const tiledCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [TILE_SIZE, TILE_SIZE],
  in: {
    gid: d.builtin.globalInvocationId,
    lid: d.builtin.localInvocationId,
    wgid: d.builtin.workgroupId,
  },
})(({ gid, lid, wgid }) => {
  const gs = d.f32(gameSizeAccessor.$);
  const texelSize = d.vec2f(1).div(gs);

  // Top-left of tile in global texel coords (-1 for halo)
  const tileOrigin = d.vec2f(wgid.xy).mul(TILE_SIZE).sub(HALO);
  const linearId = lid.y * TILE_SIZE + lid.x;

  const numGathers = d.u32(GATHER_SIZE * GATHER_SIZE);
  if (linearId < numGathers) {
    const gx = d.u32(linearId % GATHER_SIZE);
    const gy = d.u32(linearId / GATHER_SIZE);

    const sx = gx * 2;
    const sy = gy * 2;

    // UV points to the bottom-right cell of the 2x2 block we want
    // So .y gives (sx+1, sy+1), .w gives (sx, sy), etc.
    const uv = tileOrigin.add(d.vec2f(sx + 1, sy + 1)).mul(texelSize);

    // textureGather at UV returns: .w=(-1,-1), .z=(0,-1), .x=(-1,0), .y=(0,0) relative to UV
    const g = std.textureGather(
      0,
      computeLayout.$.current,
      computeLayout.$.sampler,
      uv,
    );

    // Store the 2x2 block into shared memory
    sharedTile.$[tileIdx(sx, sy)] = d.u32(g.w);
    sharedTile.$[tileIdx(sx + 1, sy)] = d.u32(g.z);
    sharedTile.$[tileIdx(sx, sy + 1)] = d.u32(g.x);
    sharedTile.$[tileIdx(sx + 1, sy + 1)] = d.u32(g.y);
  }

  std.workgroupBarrier();

  const lx = lid.x + HALO;
  const ly = lid.y + HALO;

  const current = readTile(lx, ly);
  const neighbors = countNeighborsInTile(lx, ly);
  const nextAlive = golNextState(current !== 0, neighbors);

  std.textureStore(
    computeLayout.$.next,
    gid.xy,
    d.vec4u(std.select(0, 1, nextAlive), 0, 0, 0),
  );
});
