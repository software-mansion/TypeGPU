import { d, std } from 'typegpu';

export const unpackVec2u = (packed: d.v2u): d.v4f => {
  'use gpu';
  const xy = std.unpack2x16float(packed.x);
  const zw = std.unpack2x16float(packed.y);
  return d.vec4f(xy, zw);
};

export const packVec2u = (toPack: d.v4f): d.v2u => {
  'use gpu';
  const xy = std.pack2x16float(toPack.xy);
  const zw = std.pack2x16float(toPack.zw);
  return d.vec2u(xy, zw);
};

export const getAverageNormal = (v1: d.v4f, v2: d.v4f, v3: d.v4f): d.v4f => {
  'use gpu';
  const edge1 = std.sub(v2.xyz, v1.xyz);
  const edge2 = std.sub(v3.xyz, v1.xyz);
  return std.normalize(d.vec4f(std.cross(edge1, edge2), 0));
};

export const calculateMidpoint = (v1: d.v4f, v2: d.v4f): d.v4f => {
  'use gpu';
  return d.vec4f(std.mul(0.5, std.add(v1.xyz, v2.xyz)), 1);
};
