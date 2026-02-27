import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const fragmentFn = tgpu.fragmentFn({
  in: {
    cell: d.interpolate('flat', d.u32),
    uv: d.vec2f,
  },
  out: d.vec4f,
})(({ cell, uv }) => {
  if (cell === d.u32(0)) {
    std.discard();
  }
  const u = uv.div(1.5);
  return d.vec4f(u.x, u.y, 1 - u.x, 0.8);
});
