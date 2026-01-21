import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  computeLayout,
  gameSizeAccessor,
  loadTexAt,
  TILE_SIZE,
} from './common.ts';

const sharedMemory = tgpu.workgroupVar(
  d.arrayOf(d.arrayOf(d.u32, TILE_SIZE + 2), TILE_SIZE + 2),
);

const CELLS_PER_THREAD = 2;
const ACTIVE_THREADS = TILE_SIZE / CELLS_PER_THREAD;

const HALO_SIZE = TILE_SIZE + 2;
const HALO_TOTAL = HALO_SIZE * HALO_SIZE;
const THREADS = ACTIVE_THREADS * ACTIVE_THREADS;

export const tiledCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [ACTIVE_THREADS, ACTIVE_THREADS],
  in: {
    lid: d.builtin.localInvocationId,
    wid: d.builtin.workgroupId,
  },
})(({ lid, wid }) => {
  const gs = d.u32(gameSizeAccessor.$);
  const vmax = gs - 1;
  const vmaxI = d.i32(vmax);

  const tileOrigin = wid.xy.mul(d.u32(TILE_SIZE));
  const tidFlat = lid.y * d.u32(ACTIVE_THREADS) + lid.x;

  for (let i = tidFlat; i < d.u32(HALO_TOTAL); i += d.u32(THREADS)) {
    const hx = i % d.u32(HALO_SIZE);
    const hy = i / d.u32(HALO_SIZE);

    const gx = d.i32(tileOrigin.x) + d.i32(hx) - d.i32(1);
    const gy = d.i32(tileOrigin.y) + d.i32(hy) - d.i32(1);

    const cx = std.clamp(gx, d.i32(0), vmaxI);
    const cy = std.clamp(gy, d.i32(0), vmaxI);

    const inBounds = gx >= d.i32(0) && gx <= vmaxI && gy >= d.i32(0) &&
      gy <= vmaxI;

    sharedMemory.$[hx][hy] = loadTexAt(d.vec2u(d.u32(cx), d.u32(cy))) *
      std.select(d.u32(0), d.u32(1), inBounds);
  }

  std.workgroupBarrier();

  const base = lid.xy.mul(d.u32(CELLS_PER_THREAD));

  for (let oy = 0; oy < CELLS_PER_THREAD; oy++) {
    for (let ox = 0; ox < CELLS_PER_THREAD; ox++) {
      const lx = base.x + d.u32(ox);
      const ly = base.y + d.u32(oy);

      const p = tileOrigin.add(d.vec2u(lx, ly));
      const s = d.vec2u(lx + 1, ly + 1);

      const self = sharedMemory.$[s.x][s.y];

      let neighbors = d.u32(0);
      for (let ny = 0; ny < 3; ny++) {
        for (let nx = 0; nx < 3; nx++) {
          if (nx === 1 && ny === 1) {
            continue;
          }
          neighbors = neighbors + sharedMemory.$[s.x + nx - 1][s.y + ny - 1];
        }
      }

      const alive = self !== 0;
      const outAlive = (alive && (neighbors === 2 || neighbors === 3)) ||
        (!alive && neighbors === 3);

      std.textureStore(
        computeLayout.$.next,
        p,
        d.vec4u(std.select(d.u32(0), d.u32(1), outAlive), 0, 0, 0),
      );
    }
  }
});
