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

type Kind = 'number' | 'boolean' | wgsl.AnyVecInstance['kind'] | wgsl.AnyMatInstance['kind'];

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

/**
 * If one of the arguments is a vector and other is a number,
 * the number is up cased to a vector.
 */
export function upCast<T extends number | wgsl.AnyVecInstance>(
  args: [T, T],
): [Exclude<T, number>, Exclude<T, number>] {
  let [lhs, rhs] = args;
  if (typeof lhs === 'number' && isVecInstance(rhs)) {
    const schema = constructorFor[rhs.kind];
    return [schema(lhs), rhs] as [Exclude<T, number>, Exclude<T, number>];
  } else if (isVecInstance(lhs) && typeof rhs === 'number') {
    const schema = constructorFor[lhs.kind];
    return [lhs, schema(rhs)] as [Exclude<T, number>, Exclude<T, number>];
  }
  return [lhs as wgsl.AnyVecInstance, rhs as wgsl.AnyVecInstance] as [
    Exclude<T, number>,
    Exclude<T, number>,
  ];
}

/**
 * Generalizes function of 1 or 2 arguments to work component-wise on vectors and matrices.
 * Assumes the types are already correct and performs no additional checks.
 * @param fn The function to generalize.
 * @param args Function arguments.
 * @param booleanMode By default, the result is of the same type as first argument.
 * When set to 'boolean', a boolean vector of the same arity will be used instead.
 */
export function binaryUniformInput<
  T extends number | boolean | wgsl.AnyVecInstance | wgsl.AnyMatInstance,
  FnType extends (a: number) => number | boolean = (a: number) => number | boolean,
  Mode extends 'first' | 'boolean' = 'first',
>(fn: FnType, args: [T], mode?: Mode): ModeToResult<T, Mode>;
export function binaryUniformInput<
  T extends number | boolean | wgsl.AnyVecInstance | wgsl.AnyMatInstance,
  FnType extends
    | ((a: number, b: number) => number | boolean)
    | ((a: boolean, b: boolean) => number | boolean) = (a: number, b: number) => number | boolean,
  Mode extends 'first' | 'boolean' = 'first',
>(fn: FnType, args: [T, T], mode?: Mode): ModeToResult<T, Mode>;
export function binaryUniformInput<
  T extends number | boolean | wgsl.AnyVecInstance | wgsl.AnyMatInstance,
  FnType extends
    | ((...args: number[]) => number | boolean)
    | ((...args: boolean[]) => number | boolean) = (...args: number[]) => number | boolean,
  Mode extends 'first' | 'boolean' = 'first',
>(fn: FnType, args: T[], mode?: Mode): ModeToResult<T, Mode> {
  // I'm sorry, TypeScript :c
  const types = args.map(typeOf);
  if (types.every((type) => ['boolean', 'number'].includes(type))) {
    return fn(...args) as ModeToResult<T, Mode>;
  }

  const val1Type = types[0];
  const vecConstructor = mode === 'boolean' ? booleanFor[val1Type] : constructorFor[val1Type];
  const mappableArgs = args.map(mappable);
  const putThisInConstr = Array.from({ length: mappableArgs[0]?.length }, (_, i) => {
    const args = mappableArgs.map((arg) => arg[i]);
    return fn(...args);
  });
  return vecConstructor(...(putThisInConstr as unknown as [boolean, boolean])) as T;
}

type ModeToResult<
  T extends number | boolean | wgsl.AnyVecInstance | wgsl.AnyMatInstance,
  Mode extends 'first' | 'boolean',
> = Mode extends 'boolean'
  ? T extends wgsl.AnyVec2Instance
    ? wgsl.v2b
    : T extends wgsl.AnyVec3Instance
      ? wgsl.v3b
      : wgsl.v4b
  : T;
