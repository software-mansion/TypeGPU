import { d, std } from 'typegpu';
import { awardShieldMinY } from './shape.ts';

const atlas = {
  baseTop: {
    u: d.vec4f(-0.988858, 0, 0, 0.257103),
    v: d.vec4f(-0.003848, 0, -1.112033, 0.719361),
  },
  baseBottom: {
    u: d.vec4f(1.025669, 0, 0, 0.226857),
    v: d.vec4f(0, 0, -1.107796, 0.269871),
  },
  basePosX: {
    u: d.vec4f(0, 1.06802, 0, 0.261751),
    v: d.vec4f(0, 0, -1.094562, 0.71844),
  },
  baseNegX: {
    u: d.vec4f(0, -1.02436, 0, 0.257947),
    v: d.vec4f(0, 0, -1.107795, 0.719545),
  },
  basePosZ: {
    u: d.vec4f(-1.025669, 0, 0, 0.257103),
    v: d.vec4f(0, 1.099205, 0, 0.704763),
  },
  baseNegZ: {
    u: d.vec4f(-1.025668, 0, 0, 0.257103),
    v: d.vec4f(-0.008472, -1.060223, 0, 0.738126),
  },
  slabPosX: {
    u: d.vec4f(0, 0, -1.155976, 0.716608),
    v: d.vec4f(0, -1.170811, 0, 0.335834),
  },
  slabNegX: {
    u: d.vec4f(0, 0, 1.155976, 0.716608),
    v: d.vec4f(0, -1.170811, 0, 0.835641),
  },
  rimTop: {
    u: d.vec4f(-0.685722, 0, 0, 0.040495),
    v: d.vec4f(0, 0, -1.236323, 0.22168),
  },
  rimNegZ: {
    u: d.vec4f(-0.685722, 0, 0, 0.959505),
    v: d.vec4f(0, -1.262451, 0, 0.35721),
  },
  rimPosZ: {
    u: d.vec4f(0.685722, 0, 0, 0.959505),
    v: d.vec4f(0, -1.262451, 0, 0.817289),
  },
};

const rimTopSplitY = 0.2137;

const regionUv = (p: d.v3f, uCoef: d.v4f, vCoef: d.v4f): d.v2f => {
  'use gpu';
  return d.vec2f(std.dot(uCoef.xyz, p) + uCoef.w, std.dot(vCoef.xyz, p) + vCoef.w);
};

export const awardUv = (p: d.v3f, n: d.v3f): d.v2f => {
  'use gpu';
  if (p.y < awardShieldMinY) {
    const an = std.abs(n);
    if (an.y >= an.x && an.y >= an.z) {
      if (n.y > 0) {
        return regionUv(p, atlas.baseTop.u, atlas.baseTop.v);
      }
      return regionUv(p, atlas.baseBottom.u, atlas.baseBottom.v);
    }
    if (an.x >= an.z) {
      if (n.x > 0) {
        return regionUv(p, atlas.basePosX.u, atlas.basePosX.v);
      }
      return regionUv(p, atlas.baseNegX.u, atlas.baseNegX.v);
    }
    if (n.z > 0) {
      return regionUv(p, atlas.basePosZ.u, atlas.basePosZ.v);
    }
    return regionUv(p, atlas.baseNegZ.u, atlas.baseNegZ.v);
  }
  if (std.abs(n.x) > 0.5) {
    if (n.x > 0) {
      return regionUv(p, atlas.slabPosX.u, atlas.slabPosX.v);
    }
    return regionUv(p, atlas.slabNegX.u, atlas.slabNegX.v);
  }
  if (p.y > rimTopSplitY) {
    return regionUv(p, atlas.rimTop.u, atlas.rimTop.v);
  }
  if (p.z < 0) {
    return regionUv(p, atlas.rimNegZ.u, atlas.rimNegZ.v);
  }
  return regionUv(p, atlas.rimPosZ.u, atlas.rimPosZ.v);
};
