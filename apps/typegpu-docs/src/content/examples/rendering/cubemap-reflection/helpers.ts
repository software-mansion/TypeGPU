import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const unpackVec2u = tgpu.fn([d.vec2u], d.vec4f)((packed) => {
  const xy = std.unpack2x16float(packed.x);
  const zw = std.unpack2x16float(packed.y);
  return d.vec4f(xy, zw);
});

export const packVec2u = tgpu.fn([d.vec4f], d.vec2u)((toPack) => {
  const xy = std.pack2x16float(toPack.xy);
  const zw = std.pack2x16float(toPack.zw);
  return d.vec2u(xy, zw);
});

export const getAverageNormal = tgpu.fn([d.vec4f, d.vec4f, d.vec4f], d.vec4f)(
  (v1, v2, v3) => {
    const edge1 = std.sub(v2.xyz, v1.xyz);
    const edge2 = std.sub(v3.xyz, v1.xyz);
    return std.normalize(d.vec4f(std.cross(edge1, edge2), 0));
  },
);

export const calculateMidpoint = tgpu.fn([d.vec4f, d.vec4f], d.vec4f)(
  (v1, v2) => d.vec4f(std.mul(0.5, std.add(v1.xyz, v2.xyz)), 1),
);
