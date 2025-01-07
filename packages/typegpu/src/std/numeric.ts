import type { VecKind } from '../data/vector';
import { VectorOps } from '../data/vectorOps';
import type { v3f, v3i, v3u } from '../data/wgslTypes';
import { inGPUMode } from '../gpuMode';

type vBase = { kind: VecKind };

export function add<T extends vBase>(lhs: T, rhs: T): T {
  if (inGPUMode()) {
    return `(${lhs} + ${rhs})` as unknown as T;
  }
  return VectorOps.add[lhs.kind](lhs, rhs);
}

export function sub<T extends vBase>(lhs: T, rhs: T): T {
  if (inGPUMode()) {
    return `(${lhs} - ${rhs})` as unknown as T;
  }
  return VectorOps.sub[lhs.kind](lhs, rhs);
}

export function mul<T extends vBase>(s: number, v: T): T {
  if (inGPUMode()) {
    return `(${s} * ${v})` as unknown as T;
  }
  return VectorOps.mul[v.kind](s, v);
}

export function dot<T extends vBase>(lhs: T, rhs: T): number {
  if (inGPUMode()) {
    return `dot(${lhs}, ${rhs})` as unknown as number;
  }
  return VectorOps.dot[lhs.kind](lhs, rhs);
}

export function normalize<T extends vBase>(v: T): T {
  if (inGPUMode()) {
    return `normalize(${v})` as unknown as T;
  }
  return VectorOps.normalize[v.kind](v);
}

export function cross<T extends v3f | v3i | v3u>(a: T, b: T): T {
  if (inGPUMode()) {
    return `cross(${a}, ${b})` as unknown as T;
  }
  return VectorOps.cross[a.kind](a, b);
}

export function fract(a: number): number {
  if (inGPUMode()) {
    return `fract(${a})` as unknown as number;
  }
  return a - Math.floor(a);
}

export function length<T extends vBase>(vector: T): number {
  if (inGPUMode()) {
    return `length(${vector})` as unknown as number;
  }
  return VectorOps.length[vector.kind](vector);
}

export function sin(radians: number): number {
  if (inGPUMode()) {
    return `sin(${radians})` as unknown as number;
  }
  return Math.sin(radians);
}

export function cos(radians: number): number {
  if (inGPUMode()) {
    return `cos(${radians})` as unknown as number;
  }
  return Math.cos(radians);
}
