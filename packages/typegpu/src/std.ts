import type { vecBase } from './data';
import { VectorOps } from './data/vectorOps';

export const std = {
  dot: <T extends vecBase>(lhs: T, rhs: T): number => {
    return VectorOps.dot[lhs.kind](lhs, rhs);
  },
  fract: (a: number) => a - Math.floor(a),
  length: <T extends vecBase>(vector: T): number =>
    VectorOps.length[vector.kind](vector),
  sin: Math.sin,
  cos: Math.cos,
};
