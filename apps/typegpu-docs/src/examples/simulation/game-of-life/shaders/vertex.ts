import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const sizeSlot = tgpu.slot(d.vec2u(64, 64));

export const vertexFn = tgpu.vertexFn({
  in: {
    iid: d.builtin.instanceIndex,
    cell: d.u32,
    pos: d.vec2u,
  },
  out: {
    pos: d.builtin.position,
    cell: d.interpolate('flat', d.u32),
    uv: d.vec2f,
  },
})(({ iid, cell, pos }) => {
  const w = sizeSlot.$.x;
  const h = sizeSlot.$.y;

  const col = iid % w;
  const row = d.u32(iid / w);

  const gx = col + pos.x;
  const gy = row + pos.y;

  const maxWH = d.f32(std.max(w, h));
  const x = (d.f32(gx) * 2 - d.f32(w)) / maxWH;
  const y = (d.f32(gy) * 2 - d.f32(h)) / maxWH;

  return {
    pos: d.vec4f(x, y, 0, 1),
    cell,
    uv: d.vec2f((x + 1) * 0.5, (y + 1) * 0.5),
  };
});
