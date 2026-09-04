import { tgpu, d, std } from 'typegpu';
import { awardShieldMinY } from './shape.ts';

const UvRegion = d.struct({ u: d.vec4f, v: d.vec4f });
const UvGradients = d.struct({ uv: d.vec2f, ddx: d.vec2f, ddy: d.vec2f });

const atlas = {
  baseTop: UvRegion({
    u: d.vec4f(-0.988858, 0, 0, 0.257103),
    v: d.vec4f(-0.003848, 0, -1.112033, 0.719361),
  }),
  baseBottom: UvRegion({
    u: d.vec4f(1.025669, 0, 0, 0.226857),
    v: d.vec4f(0, 0, -1.107796, 0.269871),
  }),
  basePosX: UvRegion({
    u: d.vec4f(0, 1.06802, 0, 0.261751),
    v: d.vec4f(0, 0, -1.094562, 0.71844),
  }),
  baseNegX: UvRegion({
    u: d.vec4f(0, -1.02436, 0, 0.257947),
    v: d.vec4f(0, 0, -1.107795, 0.719545),
  }),
  basePosZ: UvRegion({
    u: d.vec4f(-1.025669, 0, 0, 0.257103),
    v: d.vec4f(0, 1.099205, 0, 0.704763),
  }),
  baseNegZ: UvRegion({
    u: d.vec4f(-1.025668, 0, 0, 0.257103),
    v: d.vec4f(-0.008472, -1.060223, 0, 0.738126),
  }),
  slabPosX: UvRegion({
    u: d.vec4f(0, 0, -1.155976, 0.716608),
    v: d.vec4f(0, -1.170811, 0, 0.335834),
  }),
  slabNegX: UvRegion({
    u: d.vec4f(0, 0, 1.155976, 0.716608),
    v: d.vec4f(0, -1.170811, 0, 0.835641),
  }),
  rimTop: UvRegion({
    u: d.vec4f(-0.685722, 0, 0, 0.040495),
    v: d.vec4f(0, 0, -1.236323, 0.22168),
  }),
  rimNegZ: UvRegion({
    u: d.vec4f(-0.685722, 0, 0, 0.959505),
    v: d.vec4f(0, -1.262451, 0, 0.35721),
  }),
  rimPosZ: UvRegion({
    u: d.vec4f(0.685722, 0, 0, 0.959505),
    v: d.vec4f(0, -1.262451, 0, 0.817289),
  }),
};

const rimTopSplitY = 0.2137;

const awardRegion = tgpu.fn(
  [d.vec3f, d.vec3f],
  UvRegion,
)((p, n) => {
  'use gpu';
  if (p.y < awardShieldMinY) {
    const an = std.abs(n);
    if (an.y >= an.x && an.y >= an.z) {
      if (n.y > 0) {
        return atlas.baseTop;
      }
      return atlas.baseBottom;
    }
    if (an.x >= an.z) {
      if (n.x > 0) {
        return atlas.basePosX;
      }
      return atlas.baseNegX;
    }
    if (n.z > 0) {
      return atlas.basePosZ;
    }
    return atlas.baseNegZ;
  }
  if (std.abs(n.x) > 0.5) {
    if (n.x > 0) {
      return atlas.slabPosX;
    }
    return atlas.slabNegX;
  }
  if (p.y > rimTopSplitY) {
    return atlas.rimTop;
  }
  if (p.z < 0) {
    return atlas.rimNegZ;
  }
  return atlas.rimPosZ;
});

const regionUv = (r: d.InferGPU<typeof UvRegion>, p: d.v3f): d.v2f => {
  'use gpu';
  return d.vec2f(std.dot(r.u.xyz, p) + r.u.w, std.dot(r.v.xyz, p) + r.v.w);
};

export const awardUv = (p: d.v3f, n: d.v3f): d.v2f => {
  'use gpu';
  return regionUv(awardRegion(p, n), p);
};

export const awardUvGradients = (
  p: d.v3f,
  n: d.v3f,
  dpdx: d.v3f,
  dpdy: d.v3f,
): d.InferGPU<typeof UvGradients> => {
  'use gpu';
  const r = awardRegion(p, n);
  return UvGradients({
    uv: regionUv(r, p),
    ddx: d.vec2f(std.dot(r.u.xyz, dpdx), std.dot(r.v.xyz, dpdx)),
    ddy: d.vec2f(std.dot(r.u.xyz, dpdy), std.dot(r.v.xyz, dpdy)),
  });
};
