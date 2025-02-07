import type { VecKind } from '../data/vector';
import { VectorOps } from '../data/vectorOps';
import type { AnyMatInstance, v3f, v3i, v3u } from '../data/wgslTypes';
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

export function mul<T extends vBase | AnyMatInstance>(s: number | T, v: T): T {
  if (inGPUMode()) {
    return `(${s} * ${v})` as unknown as T;
  }
  if (typeof s === 'number') {
    return VectorOps.mulSxV[v.kind](s, v);
  }
  return VectorOps.mulVxV[v.kind](s, v);
}

export function abs<T extends vBase | number>(value: T): T {
  if (inGPUMode()) {
    return `abs(${value})` as unknown as T;
  }
  if (typeof value === 'number') {
    return Math.abs(value) as T;
  }
  return VectorOps.abs[value.kind](value) as T;
}

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#ceil-builtin
 */
export function ceil<T extends vBase | number>(value: T): T {
  if (inGPUMode()) {
    return `ceil(${value})` as unknown as T;
  }
  if (typeof value === 'number') {
    return Math.ceil(value) as T;
  }
  return VectorOps.ceil[value.kind](value) as T;
}

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#clamp
 */
export function clamp<T extends vBase | number>(value: T, low: T, high: T): T {
  if (inGPUMode()) {
    return `clamp(${value}, ${low}, ${high})` as unknown as T;
  }
  if (typeof value === 'number') {
    return Math.min(Math.max(low as number, value), high as number) as T;
  }
  return VectorOps.clamp[value.kind](value, low as vBase, high as vBase) as T;
}

// TODO: Accept vectors into `cos`
/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#cos-builtin
 */
export function cos(radians: number): number {
  if (inGPUMode()) {
    return `cos(${radians})` as unknown as number;
  }
  return Math.cos(radians);
}

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#cross-builtin
 */
export function cross<T extends v3f | v3i | v3u>(a: T, b: T): T {
  if (inGPUMode()) {
    return `cross(${a}, ${b})` as unknown as T;
  }
  return VectorOps.cross[a.kind](a, b);
}

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#dot-builtin
 */
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

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#floor-builtin
 */
export function floor<T extends vBase | number>(value: T): T {
  if (inGPUMode()) {
    return `floor(${value})` as unknown as T;
  }
  if (typeof value === 'number') {
    return Math.floor(value) as T;
  }
  return VectorOps.floor[value.kind](value) as T;
}

export function fract(a: number): number {
  if (inGPUMode()) {
    return `fract(${a})` as unknown as number;
  }
  return a - Math.floor(a);
}

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#length-builtin
 */
export function length<T extends vBase | number>(value: T): number {
  if (inGPUMode()) {
    return `length(${value})` as unknown as number;
  }
  if (typeof value === 'number') {
    return Math.abs(value);
  }
  return VectorOps.length[value.kind](value);
}

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#max-float-builtin
 */
export function max<T extends vBase | number>(a: T, b: T): T {
  if (inGPUMode()) {
    return `max(${a}, ${b})` as unknown as T;
  }
  if (typeof a === 'number') {
    return Math.max(a, b as number) as T;
  }
  return VectorOps.max[a.kind](a, b as vBase) as T;
}

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#min-float-builtin
 */
export function min<T extends vBase | number>(a: T, b: T): T {
  if (inGPUMode()) {
    return `min(${a}, ${b})` as unknown as T;
  }
  if (typeof a === 'number') {
    return Math.min(a, b as number) as T;
  }
  return VectorOps.min[a.kind](a, b as vBase) as T;
}

export function sin(radians: number): number {
  if (inGPUMode()) {
    return `sin(${radians})` as unknown as number;
  }
  return Math.sin(radians);
}

export function exp(value: number): number {
  if (inGPUMode()) {
    return `exp(${value})` as unknown as number;
  }
  return Math.exp(value);
}
