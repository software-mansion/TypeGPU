import type { ArgumentTypes } from '@ark/attest/internal/cache/ts.ts';
import { vec2b, vec3b, vec4b, vecTypeToConstructor } from './vector.ts';
import type * as wgsl from './wgslTypes.ts';

const booleanFor = {
  vec2f: vec2b,
  vec2h: vec2b,
  vec2i: vec2b,
  vec2u: vec2b,
  'vec2<bool>': vec2b,
  vec3f: vec3b,
  vec3h: vec3b,
  vec3i: vec3b,
  vec3u: vec3b,
  'vec3<bool>': vec3b,
  vec4f: vec4b,
  vec4h: vec4b,
  vec4i: vec4b,
  vec4u: vec4b,
  'vec4<bool>': vec4b,
} as const;

export function unaryInput<T extends number | wgsl.AnyNumericVecInstance>(
  fn: (a: number) => number,
  val: T,
): T;
export function unaryInput<T extends number | boolean | wgsl.AnyVecInstance>(
  fn: (a: T) => T,
  val: T,
): T {
  if (typeof val === 'boolean') {
    return fn(val) as T;
  }
  if (typeof val === 'number') {
    return fn(val) as T;
  }
  const vecConstructor = vecTypeToConstructor[val.kind];
  const mappedElements = val.map(fn as <P>(a: P) => P);
  // Total lie, but that's what all constructors accept.
  return vecConstructor(...(mappedElements as [boolean, boolean])) as T;
}
