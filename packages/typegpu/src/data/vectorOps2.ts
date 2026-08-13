import { vec2b, vec3b, vec4b, vecTypeToConstructor } from './vector.ts';
import type * as wgsl from './wgslTypes.ts';
import { mat2x2f, mat3x3f, mat4x4f } from './matrix.ts';
import { isVecInstance } from './wgslTypes.ts';
import { invariant } from '../errors.ts';

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

function getConstructorFor(mode: Mode, kind: Kind) {
  const map = mode === 'boolean' ? booleanFor : constructorFor;
  if (kind in map) {
    return map[kind as keyof typeof map];
  }
  throw new Error(`No corresponding vector/matrix type for '${kind}' kind in '${mode}' mode.`);
}

type Kind = 'number' | 'boolean' | wgsl.AnyVecInstance['kind'] | wgsl.AnyMatInstance['kind'];
type Numeric = number | /* since when */ boolean | wgsl.AnyVecInstance | wgsl.AnyMatInstance;
type Mode = 'first' | 'boolean';

export const scalarKind: Set<Kind> = new Set(['boolean', 'number']);
export const i32Kind: Set<Kind> = new Set(['number', 'vec2i', 'vec3i', 'vec4i']);
export const u32Kind: Set<Kind> = new Set(['number', 'vec2u', 'vec3u', 'vec4u']);
export const f32Kind: Set<Kind> = new Set(['number', 'vec2f', 'vec3f', 'vec4f']);
export const f16Kind: Set<Kind> = new Set(['number', 'vec2h', 'vec3h', 'vec4h']);
export const matrixKind: Set<Kind> = new Set(['mat2x2f', 'mat3x3f', 'mat4x4f']); // TODO: this isn't included anywhere
export const booleanKind: Set<Kind> = new Set([
  'boolean',
  'vec2<bool>',
  'vec3<bool>',
  'vec4<bool>',
]);
export const integerKind: Set<Kind> = new Set([...i32Kind, ...u32Kind]);
export const floatKind: Set<Kind> = new Set([...f32Kind, ...f16Kind]);
export const signedKind: Set<Kind> = new Set([...i32Kind, ...f32Kind, ...f16Kind]);
export const numericKind: Set<Kind> = new Set([...i32Kind, ...u32Kind, ...f32Kind, ...f16Kind]);

function kindOf(v: Numeric): Kind {
  if (typeof v === 'number') {
    return 'number';
  }
  if (typeof v === 'boolean') {
    return 'boolean';
  }
  return v.kind;
}

// TODO: multiple arguments
export function verifyKind(v: Numeric, valid: Set<Kind>) {
  const type = kindOf(v);
  if (!valid.has(type)) {
    throw new Error(
      `Unsupported signature. Expected one of '${[...valid].join(', ')}', got '${type}'`,
    );
  }
}

export function verifyEqualTypes(...values: Numeric[]) {
  const types = new Set(values.map(kindOf));
  if (types.size !== 1) {
    throw new Error(
      `Unsupported signature. Expected the following types to be equal: '${[...types].join(', ')}'`,
    );
  }
}

function makeIterable(item: wgsl.AnyVecInstance | wgsl.AnyMatInstance): number[] | boolean[] {
  if (item.kind.startsWith('vec')) {
    return item as wgsl.AnyVecInstance;
  }
  return (item as wgsl.AnyMatInstance).columns.flat();
}

/**
 * If one of the arguments is a vector and other is a number,
 * the number is up-cased to a vector.
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
 * Assumes the types are already correct (in particular, that they have the same length),
 * and performs no additional checks.
 * @param fn The function to generalize.
 * @param args Function arguments.
 * @param booleanMode By default, the result is of the same type as first argument.
 * When set to 'boolean', a boolean vector of the same arity will be used instead.
 */
export function generalizeFn<
  T extends Numeric,
  FnType extends (a: number) => number | boolean = (a: number) => number | boolean,
  M extends Mode = 'first',
>(fn: FnType, args: [T], mode?: M): ModeToResult<T, M>; // 1 arg

export function generalizeFn<
  T extends Numeric,
  FnType extends
    | ((a: number, b: number) => number | boolean)
    | ((a: boolean, b: boolean) => number | boolean) = (a: number, b: number) => number | boolean,
  M extends Mode = 'first',
>(fn: FnType, args: [T, T], mode?: M): ModeToResult<T, M>; // 2 args

export function generalizeFn<
  T extends Numeric,
  FnType extends
    | ((a: number, b: number, c: number) => number | boolean)
    | ((a: boolean, b: boolean, c: boolean) => number | boolean) = (
    a: number,
    b: number,
    c: number,
  ) => number,
  M extends Mode = 'first',
>(fn: FnType, args: [T, T, T], mode?: M): ModeToResult<T, M>; // 3 args

export function generalizeFn<
  T extends Numeric,
  FnType extends (...args: (number | boolean)[]) => number | boolean,
  M extends Mode = 'first',
>(fn: FnType, args: T[], mode?: M): ModeToResult<T, M> {
  // I'm sorry, TypeScript, I swear I won't lie to you no more ;-;
  const kinds = args.map(kindOf);
  if (kinds.every((type) => ['boolean', 'number'].includes(type))) {
    return fn(...(args as never[])) as ModeToResult<T, M>;
  }

  const kind = kinds[0];
  invariant(kind, `Expected kind of the first argument to be present.`);
  const constructor = getConstructorFor(mode ?? 'first', kind);

  const iterableArgs = (args as (wgsl.AnyVecInstance | wgsl.AnyMatInstance)[]).map(makeIterable);
  const constructorArgs = Array.from({ length: iterableArgs[0]?.length as number }, (_, i) => {
    const args = iterableArgs.map((arg) => arg[i]);
    return fn(...(args as never[]));
  });
  return constructor(...(constructorArgs as unknown as [boolean, boolean])) as ModeToResult<T, M>;
}

type ModeToResult<T extends Numeric, M extends Mode> = M extends 'boolean'
  ? T extends number | boolean
    ? boolean
    : T extends wgsl.AnyVec2Instance
      ? wgsl.v2b
      : T extends wgsl.AnyVec3Instance
        ? wgsl.v3b
        : wgsl.v4b
  : T;
