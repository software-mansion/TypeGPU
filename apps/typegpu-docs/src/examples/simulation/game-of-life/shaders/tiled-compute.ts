import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import tgpu from 'typegpu';
import {
  computeLayout,
  countNeighbors,
  extractNeighbors,
  gameSizeAccessor,
  gatherNeighborhood,
  golNextState,
  TILE_SIZE,
} from './common.ts';

export const tiledCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [TILE_SIZE, TILE_SIZE],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  const gs = d.f32(gameSizeAccessor.$);
  const texelSize = d.vec2f(1 / gs, 1 / gs);
  const uv = d.vec2f(gid.xy).mul(texelSize);

  const neighborhood = gatherNeighborhood(
    computeLayout.$.current,
    computeLayout.$.sampler,
    uv,
    texelSize,
  );

  const neighbors = extractNeighbors(neighborhood);
  const neighborCount = countNeighbors(neighbors);

  const alive = neighborhood.mc !== 0;
  const nextAlive = golNextState(alive, neighborCount);

  std.textureStore(
    computeLayout.$.next,
    gid.xy,
    d.vec4u(std.select(d.u32(0), d.u32(1), nextAlive), 0, 0, 0),
  );
});
