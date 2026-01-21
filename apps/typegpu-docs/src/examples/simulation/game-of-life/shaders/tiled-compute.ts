import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { computeLayout, gameSizeAccessor, TILE_SIZE } from './common.ts';

export const tiledCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [TILE_SIZE, TILE_SIZE],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  const gs = d.f32(gameSizeAccessor.$);
  const p = gid.xy;
  const texel = d.vec2f(1 / gs, 1 / gs);

  const uv = d.vec2f(d.f32(p.x), d.f32(p.y)).mul(texel);

  // g1 at (x,y): NW(.w), N(.z), W(.x), Center(.y)
  const g1 = std.textureGather(
    d.i32(0),
    computeLayout.$.current,
    computeLayout.$.sampler,
    uv,
  );

  // g2 at (x+1,y+1): Center(.w), E(.z), S(.x), SE(.y)
  const g2 = std.textureGather(
    d.i32(0),
    computeLayout.$.current,
    computeLayout.$.sampler,
    uv.add(texel),
  );

  // g3 at (x+1,y): N(.w), NE(.z), Center(.x), E(.y)
  const g3 = std.textureGather(
    d.i32(0),
    computeLayout.$.current,
    computeLayout.$.sampler,
    uv.add(d.vec2f(texel.x, 0)),
  );

  // g4 at (x,y+1): W(.w), Center(.z), SW(.x), S(.y)
  const g4 = std.textureGather(
    d.i32(0),
    computeLayout.$.current,
    computeLayout.$.sampler,
    uv.add(d.vec2f(0, texel.y)),
  );

  // g1: need W(.x) + N(.z) + NW(.w) = dot with (1,0,1,1)
  // g2: need E(.z) + S(.x) + SE(.y) = dot with (1,1,1,0)
  const sum1 = std.dot(g1, d.vec4u(1, 0, 1, 1));
  const sum2 = std.dot(g2, d.vec4u(1, 1, 1, 0));
  const neighbors = d.u32(sum1 + sum2 + g3.z + g4.x);

  const self = g1.y;
  const alive = self !== 0;
  const outAlive = (alive && (neighbors === 2 || neighbors === 3)) ||
    (!alive && neighbors === 3);

  std.textureStore(
    computeLayout.$.next,
    p,
    d.vec4u(std.select(d.u32(0), d.u32(1), outAlive), 0, 0, 0),
  );
});
