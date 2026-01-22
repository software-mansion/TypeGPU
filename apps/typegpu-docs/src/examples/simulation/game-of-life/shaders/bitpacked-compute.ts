import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import tgpu from 'typegpu';
import {
  bitpackedLayout,
  bitpackedNeighbors,
  gameSizeAccessor,
  gatherNeighborhood,
  golNextStateBitpacked,
  parallelCount8,
  TILE_SIZE,
} from './common.ts';

export const bitpackedCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [TILE_SIZE, TILE_SIZE],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  const gameSize = gameSizeAccessor.$;
  const packedWidth = d.u32(gameSize / 32);

  if (gid.x >= packedWidth || gid.y >= gameSize) {
    return;
  }

  const texelSize = d.vec2f(1.0 / packedWidth, 1.0 / gameSize);
  const uv = d.vec2f(gid.xy).mul(texelSize);

  const neighborhood = gatherNeighborhood(
    bitpackedLayout.$.current,
    bitpackedLayout.$.sampler,
    uv,
    texelSize,
  );

  const neighbors = bitpackedNeighbors(neighborhood);
  const count = parallelCount8(neighbors);
  const next = golNextStateBitpacked(neighborhood.mc, count);

  std.textureStore(bitpackedLayout.$.next, gid.xy, d.vec4u(next, 0, 0, 0));
});
