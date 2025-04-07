import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const unpackVec2u = tgpu['~unstable'].fn(
  { packed: d.vec2u },
  d.vec4f,
)(({ packed }) => {
  const xy = std.unpack2x16float(packed.x);
  const zw = std.unpack2x16float(packed.y);
  return d.vec4f(xy, zw);
});

export const packVec2u = tgpu['~unstable'].fn(
  { toPack: d.vec4f },
  d.vec2u,
)(({ toPack }) => {
  const xy = std.pack2x16float(toPack.xy);
  const zw = std.pack2x16float(toPack.zw);
  return d.vec2u(xy, zw);
});

export const normalizeSafely = tgpu['~unstable'].fn(
  { v: d.vec4f },
  d.vec4f,
)(({ v }) => {
  const length = std.length(v.xyz);
  if (length < 1e-8) {
    return d.vec4f(0, 0, 1, 1);
  }
  return d.vec4f(v.x / length, v.y / length, v.z / length, 1);
});

export const getNormal = tgpu['~unstable'].fn(
  {
    v1: d.vec4f,
    v2: d.vec4f,
    v3: d.vec4f,
    smoothNormals: d.u32,
    vertexPos: d.vec4f,
  },
  d.vec4f,
)(({ v1, v2, v3, smoothNormals, vertexPos }) => {
  if (smoothNormals === 1) {
    return vertexPos;
  }
  const edge1 = d.vec4f(v2.x - v1.x, v2.y - v1.y, v2.z - v1.z, 0);
  const edge2 = d.vec4f(v3.x - v1.x, v3.y - v1.y, v3.z - v1.z, 0);
  return normalizeSafely({
    v: d.vec4f(std.cross(edge1.xyz, edge2.xyz), 0),
  });
});

export const calculateMidpoint = tgpu['~unstable'].fn(
  { v1: d.vec4f, v2: d.vec4f },
  d.vec4f,
)(({ v1, v2 }) => {
  return d.vec4f(
    (v1.x + v2.x) * 0.5,
    (v1.y + v2.y) * 0.5,
    (v1.z + v2.z) * 0.5,
    1,
  );
});
