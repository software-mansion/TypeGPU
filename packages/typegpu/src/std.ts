import type { vec3f, vec3i, vec3u, vecBase } from './data';
import { VectorOps } from './data/vectorOps';

export const std = {
  add: <T extends vecBase>(lhs: T, rhs: T): T =>
    VectorOps.add[lhs.kind](lhs, rhs),
  sub: <T extends vecBase>(lhs: T, rhs: T): T =>
    VectorOps.sub[lhs.kind](lhs, rhs),
  mul: <T extends vecBase>(s: number, v: T): T => VectorOps.mul[v.kind](s, v),
  dot: <T extends vecBase>(lhs: T, rhs: T): number =>
    VectorOps.dot[lhs.kind](lhs, rhs),
  normalize: <T extends vecBase>(v: T): T => VectorOps.normalize[v.kind](v),
  cross: <T extends vec3f | vec3i | vec3u>(a: T, b: T): T =>
    VectorOps.cross[a.kind](a, b),
  fract: (a: number): number => a - Math.floor(a),
  length: <T extends vecBase>(vector: T): number =>
    VectorOps.length[vector.kind](vector),
  sin: Math.sin,
  cos: Math.cos,
};
