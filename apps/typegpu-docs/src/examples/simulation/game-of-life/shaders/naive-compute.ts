import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  computeLayout,
  gameSizeAccessor,
  loadTexAt,
  TILE_SIZE,
} from './common.ts';

export const naiveCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [TILE_SIZE, TILE_SIZE],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const gs = d.u32(gameSizeAccessor.$);
  const vmax = gs - 1;
  const p = gid.xy;

  let neighbors = d.u32(0);
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      if (ox === 0 && oy === 0) {
        continue;
      }
      const nx = d.i32(p.x) + d.i32(ox);
      const ny = d.i32(p.y) + d.i32(oy);
      const ok = nx >= 0 && ny >= 0 &&
        nx <= d.i32(vmax) && ny <= d.i32(vmax);
      const sample = loadTexAt(
        d.vec2u(
          std.select(d.u32(0), d.u32(nx), ok),
          std.select(d.u32(0), d.u32(ny), ok),
        ),
      ) * std.select(d.u32(0), d.u32(1), ok);
      neighbors = neighbors + sample;
    }
  }

  const self = loadTexAt(p);
  const alive = self !== 0;
  const outAlive = (alive && (neighbors === 2 || neighbors === 3)) ||
    (!alive && neighbors === 3);

  std.textureStore(
    computeLayout.$.next,
    p,
    d.vec4u(std.select(d.u32(0), d.u32(1), outAlive), 0, 0, 0),
  );
});
