import type { ArgumentTypes } from '@ark/attest/internal/cache/ts.ts';
import { vec2b, vec3b, vec4b, vecTypeToConstructor } from './vector.ts';
import type * as wgsl from './wgslTypes.ts';
import { mat2x2f, mat3x3f, mat4x4f } from './matrix.ts';
import { isVecInstance } from './wgslTypes.ts';

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

const constructorFor = {
  ...vecTypeToConstructor,
  mat2x2f,
  mat3x3f,
  mat4x4f,
} as const;

type KindSet = Set<
  'number' | 'boolean' | wgsl.AnyVecInstance['kind'] | wgsl.AnyMatInstance['kind']
>;

export const kind_scalar: KindSet = new Set(['boolean', 'number']);
export const kind_i32: KindSet = new Set(['number', 'vec2i', 'vec3i', 'vec4i']);
export const kind_u32: KindSet = new Set(['number', 'vec2u', 'vec3u', 'vec4u']);
export const kind_f32: KindSet = new Set(['number', 'vec2f', 'vec3f', 'vec4f']);
export const kind_f16: KindSet = new Set(['number', 'vec2h', 'vec3h', 'vec4h']);
export const kind_boolean: KindSet = new Set(['boolean', 'vec2<bool>', 'vec3<bool>', 'vec4<bool>']);
export const kind_integer: KindSet = new Set([...kind_i32, ...kind_u32]);
export const kind_float: KindSet = new Set([...kind_f32, ...kind_f16]);
export const kind_signed: KindSet = new Set([...kind_i32, ...kind_f32, ...kind_f16]);
export const kind_numeric: KindSet = new Set([...kind_i32, ...kind_u32, ...kind_f32, ...kind_f16]);
export const kind_matrix: KindSet = new Set(['mat2x2f', 'mat3x3f', 'mat4x4f']);

function typeOf(
  v: number | boolean | wgsl.AnyVecInstance | wgsl.AnyMatInstance,
): 'number' | 'boolean' | wgsl.AnyVecInstance['kind'] | wgsl.AnyMatInstance['kind'] {
  if (typeof v === 'number') {
    return 'number';
  }
  if (typeof v === 'boolean') {
    return 'boolean';
  }
  return v.kind;
}

export function verifyType(v: number | boolean | wgsl.AnyVecInstance, valid: KindSet) {
  const type = typeOf(v);
  if (!valid.has(type)) {
    throw new Error(
      `Unsupported signature. Expected one of '${[...valid].join(', ')}', got '${type}'`,
    );
  }
}

export function verifyEqualTypes(...values: (number | boolean | wgsl.AnyVecInstance)[]) {
  const types = new Set(values.map(typeOf));
  if (types.size !== 1) {
    throw new Error(
      `Unsupported signature. Expected the following types to be equal: '${[...types].join(', ')}'`,
    );
  }
}

function mappable(item: wgsl.AnyVecInstance | wgsl.AnyMatInstance): number[] | boolean[] {
  if (item.kind.startsWith('vec')) {
    return item as wgsl.AnyVecInstance;
  }
  return (item as wgsl.AnyMatInstance).columns.flat();
}

export function unaryInput<T extends number | wgsl.AnyNumericVecInstance | wgsl.AnyMatInstance>(
  fn: (a: number) => number,
  val: T,
): T;
export function unaryInput<T extends number | boolean | wgsl.AnyVecInstance | wgsl.AnyMatInstance>(
  fn: (a: T) => T,
  val: T,
): T {
  if (typeof val === 'boolean') {
    return fn(val) as T;
  }
  if (typeof val === 'number') {
    return fn(val) as T;
  }
  const vecConstructor = constructorFor[val.kind];
  const mappedElements = mappable(val).map(fn as <P>(a: P) => P);
  // Total lie, but that's what all constructors accept.
  return vecConstructor(...(mappedElements as [boolean, boolean])) as T;
}

// TODO: take in args as an array, and extract upcast to another function
export function binaryUniformInput<
  T extends number | wgsl.AnyNumericVecInstance | wgsl.AnyMatInstance,
>(fn: (a: number, b: number) => number, val1: T, val2: T, allowUpcast?: boolean): T;
export function binaryUniformInput<
  T extends number | boolean | wgsl.AnyVecInstance | wgsl.AnyMatInstance,
>(fn: (a: T, b: T) => T, _val1: T, _val2: T, allowUpcast: boolean = false): T {
  let val1 = _val1;
  let val2 = _val2;
  if (allowUpcast) {
    if (typeof val1 === 'number' && isVecInstance(val2)) {
      const schema = constructorFor[val2.kind];
      val1 = schema(val1) as T;
    } else if (isVecInstance(val1) && typeof val2 === 'number') {
      const schema = constructorFor[val1.kind];
      val2 = schema(val2) as T;
    }
  }

  const val1Type = typeOf(val1);
  const val2Type = typeOf(val2);
  if (val1Type !== val2Type) {
    throw new Error(`Expected uniform types, got '${val1Type}' and '${val2Type}'.`);
  }
  if (val1Type === 'boolean' || val1Type === 'number') {
    return fn(val1, val2) as T;
  }
  const vecConstructor = constructorFor[val1Type];
  const mapped1 = mappable(val1 as wgsl.AnyVecInstance | wgsl.AnyMatInstance);
  const mapped2 = mappable(val2 as wgsl.AnyVecInstance | wgsl.AnyMatInstance);
  const mappedElements = mapped1.map((value, i) => fn(value as T, mapped2[i] as T));
  // Total lie, but that's what all constructors accept.
  return vecConstructor(...(mappedElements as unknown as [boolean, boolean])) as T;
}
