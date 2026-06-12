import {
  opExtrudeX,
  opSmoothDifference,
  opSmoothUnion,
  opUnion,
  sdBox2d,
  sdBox3d,
} from '@typegpu/sdf';
import { d, std } from 'typegpu';

const shieldHalfThickness = 0.0355;
const baseCenter = d.vec3f(0, -0.17638, 0);
const baseHalfExtents = d.vec3f(0.12689, 0.0506, 0.13941);

const ellipseRadii = d.vec2f(0.16054, 0.34323);
const ellipseMinRadius = Math.min(ellipseRadii.x, ellipseRadii.y);
const ellipseCenterY = 0.20558;
const topCutCenter = d.vec2f(0.3307, 0.9398);
const topCutRadius = 0.7409;
const topCutSmoothness = 0.01;
const footSmoothness = 0.022;
const baseSliceHalf = d.vec2f(0.13941, 0.0506);

const sdEllipseApprox = (p: d.v2f): number => {
  'use gpu';
  return (std.length(p / ellipseRadii) - 1) * ellipseMinRadius;
};

const sdShieldSmooth2d = (p: d.v2f): number => {
  'use gpu';
  const body = sdEllipseApprox(d.vec2f(p.x, p.y - ellipseCenterY));
  const topCut = std.length(d.vec2f(std.abs(p.x), p.y) - topCutCenter) - topCutRadius;
  const shield = opSmoothDifference(body, topCut, topCutSmoothness);
  const baseSlice = sdBox2d(d.vec2f(p.x, p.y - baseCenter.y), baseSliceHalf);
  return opSmoothUnion(shield, baseSlice, footSmoothness);
};

export const sdAwardSmooth = (p: d.v3f): number => {
  'use gpu';
  const silhouette = sdShieldSmooth2d(d.vec2f(p.z, p.y));
  const shield = opExtrudeX(p, silhouette, shieldHalfThickness);
  const base = sdBox3d(p - baseCenter, baseHalfExtents);
  return opUnion(shield, base);
};

const woodBlockCenter = d.vec3f(0, -0.2, 0);
const woodBlockHalfExtents = d.vec3f(0.06, 0.04, 0.17);

export const sdEpoxyWood = (p: d.v3f): number => {
  'use gpu';
  return sdBox3d(p - woodBlockCenter, woodBlockHalfExtents);
};

export const awardShieldMinY = -0.1248;

export const awardBoundsCenter = d.vec3f(0, 0.023, 0);
export const awardBoundsRadius = 0.33;
