import type { vecBase } from './data/vector';
import { VectorOps } from './data/vectorOps';
import type { $Vec3f, $Vec3i, $Vec3u } from './data/wgslTypes';
import { inGPUMode } from './gpuMode';

export const std = {
  add<T extends vecBase>(lhs: T, rhs: T): T {
    if (inGPUMode()) {
      return `(${lhs} + ${rhs})` as unknown as T;
    }
    return VectorOps.add[lhs.kind](lhs, rhs);
  },
  sub<T extends vecBase>(lhs: T, rhs: T): T {
    if (inGPUMode()) {
      return `(${lhs} - ${rhs})` as unknown as T;
    }
    return VectorOps.sub[lhs.kind](lhs, rhs);
  },
  mul: <T extends vecBase>(s: number, v: T): T => {
    if (inGPUMode()) {
      return `(${s} * ${v})` as unknown as T;
    }
    return VectorOps.mul[v.kind](s, v);
  },
  dot<T extends vecBase>(lhs: T, rhs: T): number {
    if (inGPUMode()) {
      return `dot(${lhs}, ${rhs})` as unknown as number;
    }
    return VectorOps.dot[lhs.kind](lhs, rhs);
  },
  normalize: <T extends vecBase>(v: T): T => {
    if (inGPUMode()) {
      return `normalize(${v})` as unknown as T;
    }
    return VectorOps.normalize[v.kind](v);
  },
  cross<T extends $Vec3f | $Vec3i | $Vec3u>(a: T, b: T): T {
    if (inGPUMode()) {
      return `cross(${a}, ${b})` as unknown as T;
    }
    return VectorOps.cross[a.kind](a, b);
  },
  fract(a: number): number {
    if (inGPUMode()) {
      return `fract(${a})` as unknown as number;
    }
    return a - Math.floor(a);
  },
  length<T extends vecBase>(vector: T): number {
    if (inGPUMode()) {
      return `length(${vector})` as unknown as number;
    }
    return VectorOps.length[vector.kind](vector);
  },
  sin(radians: number): number {
    if (inGPUMode()) {
      return `sin(${radians})` as unknown as number;
    }
    return Math.sin(radians);
  },
  cos(radians: number): number {
    if (inGPUMode()) {
      return `cos(${radians})` as unknown as number;
    }
    return Math.cos(radians);
  },
};
