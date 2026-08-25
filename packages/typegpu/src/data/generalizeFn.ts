import { vec2b, vec3b, vec4b, vecTypeToConstructor } from './vector.ts';
import { mat2x2f, mat3x3f, mat4x4f } from './matrix.ts';
import {
  isVecInstance,
  type AnyBooleanVecInstance,
  type AnyMatInstance,
  type AnyVec2Instance,
  type AnyVec3Instance,
  type AnyVec4Instance,
  type AnyVecInstance,
  type v2b,
  type v3b,
  type v4b,
} from './wgslTypes.ts';
import { invariant, WgslTypeError } from '../errors.ts';

type Vec = AnyVecInstance; // alias
type Mat = AnyMatInstance; // alias

type Kind = 'number' | 'boolean' | Vec['kind'] | Mat['kind'];
type Algebraic = number | boolean | Vec | Mat;
type Mode = 'first' | 'boolean';
export type ToBool<T extends Algebraic> = T extends number | boolean
  ? boolean
  : T extends AnyVec2Instance
    ? v2b
    : T extends AnyVec3Instance
      ? v3b
      : T extends AnyVec4Instance
        ? v4b
        : never;

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

function makeIterable(item: Vec | Mat): number[] | boolean[] {
  if (item.kind.startsWith('vec')) {
    return item as Vec;
  }
  return (item as Mat).columns.flat();
}

function applyArgs(
  fn: (...args: never[]) => number | boolean,
  args: Algebraic[],
  mode: Mode,
): Algebraic {
  // I'm sorry, TypeScript, I swear I won't lie to you no more ;-;
  const kinds = args.map(kindOf);
  if (kinds.every((type) => type === 'boolean' || type === 'number')) {
    return fn(...(args as never[]));
  }

  const kind = kinds[0];
  invariant(kind, `Expected kind of the first argument to be present.`);
  const constructor = getConstructorFor(mode, kind);

  const iterableArgs = (args as (Vec | Mat)[]).map(makeIterable);
  const length = iterableArgs[0]?.length;
  invariant(length !== undefined, `Expected constructor to have at least one argument.`);
  const constructorArgs = Array.from({ length }, (_, i) => {
    const args = iterableArgs.map((arg) => arg[i]);
    return fn(...(args as never[]));
  });
  return constructor(...(constructorArgs as unknown as [boolean, boolean]));
}

/**
 * Generalizes function of 1 to 3 arguments to work component-wise on vectors and matrices.
 * Assumes the types are already correct (in particular, that they have the same length),
 * and performs no additional checks.
 * The return type is the same as the first argument's type.
 */
export function generalizeFn<T extends Algebraic>(fn: (a: number) => number, args: [T]): T;
export function generalizeFn<T extends Algebraic>(
  fn: (a: number, b: number) => number,
  args: [T, T],
): T;
export function generalizeFn<T extends Algebraic>(
  fn: (a: number, b: number, c: number) => number,
  args: [T, T, T],
): T;
export function generalizeFn<T extends Algebraic>(fn: (...args: number[]) => number, args: T[]): T {
  return applyArgs(fn, args, 'first') as T;
}

/**
 * Analogous to `generalizeFn`, but the return type is a boolean vector instead.
 */
export function generalizeBoolFn<T extends boolean | AnyBooleanVecInstance>(
  fn: (a: boolean) => boolean,
  args: [T],
): T;
export function generalizeBoolFn<T extends Algebraic>(
  fn: (a: number, b: number) => boolean,
  args: [T, T],
): ToBool<T>;
export function generalizeBoolFn<T extends boolean | AnyBooleanVecInstance>(
  fn: (a: boolean, b: boolean) => boolean,
  args: [T, T],
): ToBool<T>;
export function generalizeBoolFn<T extends Algebraic>(
  fn: (...args: never[]) => number | boolean,
  args: T[],
): ToBool<T> {
  return applyArgs(fn, args, 'boolean') as ToBool<T>;
}

export function kindOf(v: Algebraic): Kind {
  if (typeof v === 'number') {
    return 'number';
  }
  if (typeof v === 'boolean') {
    return 'boolean';
  }
  return v.kind;
}

// Unless matrix is mentioned in the name, it is not included.
const i32Kind: Set<Kind> = new Set(['number', 'vec2i', 'vec3i', 'vec4i']);
export const u32Kind: Set<Kind> = new Set(['number', 'vec2u', 'vec3u', 'vec4u']);
export const f32Kind: Set<Kind> = new Set(['number', 'vec2f', 'vec3f', 'vec4f']);
export const f16Kind: Set<Kind> = new Set(['number', 'vec2h', 'vec3h', 'vec4h']);
export const matrixKind: Set<Kind> = new Set(['mat2x2f', 'mat3x3f', 'mat4x4f']);
export const booleanKind: Set<Kind> = new Set([
  'boolean',
  'vec2<bool>',
  'vec3<bool>',
  'vec4<bool>',
]);
export const floatKind: Set<Kind> = new Set([...f32Kind, ...f16Kind]);
export const signedKind: Set<Kind> = new Set([...i32Kind, ...f32Kind, ...f16Kind]);
export const numericKind: Set<Kind> = new Set([...i32Kind, ...u32Kind, ...f32Kind, ...f16Kind]);
export const numericOrBooleanKind: Set<Kind> = new Set([...numericKind, ...booleanKind]);
export const numericOrMatrixKind: Set<Kind> = new Set([...numericKind, ...matrixKind]);
export const crossKind: Set<Kind> = new Set(['vec3f', 'vec3h']);

export function verifyKind(
  v: Algebraic | Algebraic[],
  valid: Set<Kind>,
  excludeScalar: boolean = false,
) {
  if (!isVecInstance(v) && Array.isArray(v)) {
    v.forEach((item) => verifyKind(item, valid, excludeScalar));
    return;
  }
  const kind = kindOf(v);
  if (!valid.has(kind)) {
    throw new WgslTypeError(
      `Unsupported signature. Expected one of '${[...valid].join(', ')}', got '${kind}'.`,
    );
  }
  if (excludeScalar && (kind === 'number' || kind === 'boolean')) {
    throw new WgslTypeError(
      `Unsupported signature. Expected kind to not be scalar, got '${kind}'.`,
    );
  }
}

export function verifyEqualKinds(...values: Algebraic[]) {
  const kinds = new Set(values.map(kindOf));
  if (kinds.size !== 1) {
    throw new WgslTypeError(
      `Unsupported signature. Expected the following kinds to be equal: '${[...kinds].join(', ')}'.`,
    );
  }
}

/**
 * If one of the arguments is a vector and other is a number,
 * the number is up-cased to a vector.
 */
export function upCast<T extends number | Vec | Mat>(
  args: [T, T],
): [Exclude<T, number>, Exclude<T, number>] {
  const [lhs, rhs] = args;
  if (typeof lhs === 'number' && isVecInstance(rhs)) {
    const schema = constructorFor[rhs.kind];
    return [schema(lhs), rhs] as [Exclude<T, number>, Exclude<T, number>];
  } else if (isVecInstance(lhs) && typeof rhs === 'number') {
    const schema = constructorFor[lhs.kind];
    return [lhs, schema(rhs)] as [Exclude<T, number>, Exclude<T, number>];
  }
  return [lhs, rhs] as [Exclude<T, number>, Exclude<T, number>];
}
