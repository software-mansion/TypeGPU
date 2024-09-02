import type { vecBase } from './data';
import { VectorOps } from './data/vectorOps';

export const std = {
  dot: <T extends vecBase>(lhs: T, rhs: T): number => {
    return VectorOps.dot[lhs.kind](lhs, rhs);
  },
  // TODO: Verify if `fract` behavior is the same in JS and WGSL
  fract: (a: number) => a - Math.trunc(a),
  length: <T extends vecBase>(vector: T): number =>
    VectorOps.length[vector.kind](vector),
  sin: Math.sin,
  cos: Math.cos,
};
