import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { bool, f32 } from '../data/numeric.ts';
import { isSnippetNumeric, snip } from '../data/snippet.ts';
import { vec2b, vec3b, vec4b } from '../data/vector.ts';
import { VectorOps } from '../data/vectorOps.ts';
import {
  type AnyBooleanVecInstance,
  type AnyFloatVecInstance,
  type AnyNumericVecInstance,
  type AnyVec2Instance,
  type AnyVec3Instance,
  type AnyVecInstance,
  type AnyWgslData,
  type BaseData,
  isVecInstance,
  type v2b,
  type v3b,
  type v4b,
} from '../data/wgslTypes.ts';
import { unify } from '../tgsl/conversion.ts';
import { sub } from './operators.ts';

function correspondingBooleanVectorSchema(dataType: BaseData) {
  if (dataType.type.includes('2')) {
    return vec2b;
  }
  if (dataType.type.includes('3')) {
    return vec3b;
  }
  return vec4b;
}

// comparison

/**
 * Checks whether `lhs == rhs` on all components.
 * Equivalent to `all(eq(lhs, rhs))`.
 * @example
 * allEq(vec2f(0.0, 1.0), vec2f(0.0, 2.0)) // returns false
 * allEq(vec3u(0, 1, 2), vec3u(0, 1, 2)) // returns true
 */
export const allEq = dualImpl({
  name: 'allEq',
  signature: (...argTypes) => ({ argTypes, returnType: bool }),
  normalImpl: <T extends AnyVecInstance>(lhs: T, rhs: T) =>
    cpuAll(cpuEq(lhs, rhs)),
  codegenImpl: (_ctx, [lhs, rhs]) => stitch`all(${lhs} == ${rhs})`,
});

const cpuEq = <T extends AnyVecInstance>(lhs: T, rhs: T) =>
  VectorOps.eq[lhs.kind](lhs, rhs);

/**
 * Checks **component-wise** whether `lhs == rhs`.
 * This function does **not** return `bool`, for that use-case, wrap the result in `all`, or use `allEq`.
 * @example
 * eq(vec2f(0.0, 1.0), vec2f(0.0, 2.0)) // returns vec2b(true, false)
 * eq(vec3u(0, 1, 2), vec3u(2, 1, 0)) // returns vec3b(false, true, false)
 * all(eq(vec4i(4, 3, 2, 1), vec4i(4, 3, 2, 1))) // returns true
 * allEq(vec4i(4, 3, 2, 1), vec4i(4, 3, 2, 1)) // returns true
 */
export const eq = dualImpl({
  name: 'eq',
  signature: (...argTypes) => ({
    argTypes,
    returnType: correspondingBooleanVectorSchema(argTypes[0]),
  }),
  normalImpl: cpuEq,
  codegenImpl: (_ctx, [lhs, rhs]) => stitch`(${lhs} == ${rhs})`,
});

/**
 * Checks **component-wise** whether `lhs != rhs`.
 * This function does **not** return `bool`, for that use-case, wrap the result in `any`.
 * @example
 * ne(vec2f(0.0, 1.0), vec2f(0.0, 2.0)) // returns vec2b(false, true)
 * ne(vec3u(0, 1, 2), vec3u(2, 1, 0)) // returns vec3b(true, false, true)
 * any(ne(vec4i(4, 3, 2, 1), vec4i(4, 2, 2, 1))) // returns true
 */
export const ne = dualImpl({
  name: 'ne',
  signature: (...argTypes) => ({
    argTypes,
    returnType: correspondingBooleanVectorSchema(argTypes[0]),
  }),
  normalImpl: <T extends AnyVecInstance>(lhs: T, rhs: T) =>
    cpuNot(cpuEq(lhs, rhs)),
  codegenImpl: (_ctx, [lhs, rhs]) => stitch`(${lhs} != ${rhs})`,
});

const cpuLt = <T extends AnyNumericVecInstance>(lhs: T, rhs: T) =>
  VectorOps.lt[lhs.kind](lhs, rhs);

/**
 * Checks **component-wise** whether `lhs < rhs`.
 * This function does **not** return `bool`, for that use-case, wrap the result in `all`.
 * @example
 * lt(vec2f(0.0, 0.0), vec2f(0.0, 1.0)) // returns vec2b(false, true)
 * lt(vec3u(0, 1, 2), vec3u(2, 1, 0)) // returns vec3b(true, false, false)
 * all(lt(vec4i(1, 2, 3, 4), vec4i(2, 3, 4, 5))) // returns true
 */
export const lt = dualImpl({
  name: 'lt',
  signature: (...argTypes) => ({
    argTypes,
    returnType: correspondingBooleanVectorSchema(argTypes[0]),
  }),
  normalImpl: cpuLt,
  codegenImpl: (_ctx, [lhs, rhs]) => stitch`(${lhs} < ${rhs})`,
});

/**
 * Checks **component-wise** whether `lhs <= rhs`.
 * This function does **not** return `bool`, for that use-case, wrap the result in `all`.
 * @example
 * le(vec2f(0.0, 0.0), vec2f(0.0, 1.0)) // returns vec2b(true, true)
 * le(vec3u(0, 1, 2), vec3u(2, 1, 0)) // returns vec3b(true, true, false)
 * all(le(vec4i(1, 2, 3, 4), vec4i(2, 3, 3, 5))) // returns true
 */
export const le = dualImpl({
  name: 'le',
  signature: (...argTypes) => ({
    argTypes,
    returnType: correspondingBooleanVectorSchema(argTypes[0]),
  }),
  normalImpl: <T extends AnyNumericVecInstance>(lhs: T, rhs: T) =>
    cpuOr(cpuLt(lhs, rhs), cpuEq(lhs, rhs)),
  codegenImpl: (_ctx, [lhs, rhs]) => stitch`(${lhs} <= ${rhs})`,
});

/**
 * Checks **component-wise** whether `lhs > rhs`.
 * This function does **not** return `bool`, for that use-case, wrap the result in `all`.
 * @example
 * gt(vec2f(0.0, 0.0), vec2f(0.0, 1.0)) // returns vec2b(false, false)
 * gt(vec3u(0, 1, 2), vec3u(2, 1, 0)) // returns vec3b(false, false, true)
 * all(gt(vec4i(2, 3, 4, 5), vec4i(1, 2, 3, 4))) // returns true
 */
export const gt = dualImpl({
  name: 'gt',
  signature: (...argTypes) => ({
    argTypes,
    returnType: correspondingBooleanVectorSchema(argTypes[0]),
  }),
  normalImpl: <T extends AnyNumericVecInstance>(lhs: T, rhs: T) =>
    cpuAnd(cpuNot(cpuLt(lhs, rhs)), cpuNot(cpuEq(lhs, rhs))),
  codegenImpl: (_ctx, [lhs, rhs]) => stitch`(${lhs} > ${rhs})`,
});

/**
 * Checks **component-wise** whether `lhs >= rhs`.
 * This function does **not** return `bool`, for that use-case, wrap the result in `all`.
 * @example
 * ge(vec2f(0.0, 0.0), vec2f(0.0, 1.0)) // returns vec2b(true, false)
 * ge(vec3u(0, 1, 2), vec3u(2, 1, 0)) // returns vec3b(false, true, true)
 * all(ge(vec4i(2, 2, 4, 5), vec4i(1, 2, 3, 4))) // returns true
 */
export const ge = dualImpl({
  name: 'ge',
  signature: (...argTypes) => ({
    argTypes: argTypes,
    returnType: correspondingBooleanVectorSchema(argTypes[0]),
  }),
  normalImpl: <T extends AnyNumericVecInstance>(lhs: T, rhs: T) =>
    cpuNot(cpuLt(lhs, rhs)),
  codegenImpl: (_ctx, [lhs, rhs]) => stitch`(${lhs} >= ${rhs})`,
});

// logical ops

const cpuNot = <T extends AnyBooleanVecInstance>(value: T): T =>
  VectorOps.neg[value.kind](value);

/**
 * Returns **component-wise** `!value`.
 * @example
 * not(vec2b(false, true)) // returns vec2b(true, false)
 * not(vec3b(true, true, false)) // returns vec3b(false, false, true)
 */
export const not = dualImpl({
  name: 'not',
  signature: (...argTypes) => ({ argTypes, returnType: argTypes[0] }),
  normalImpl: cpuNot,
  codegenImpl: (_ctx, [arg]) => stitch`!(${arg})`,
});

const cpuOr = <T extends AnyBooleanVecInstance>(lhs: T, rhs: T) =>
  VectorOps.or[lhs.kind](lhs, rhs);

/**
 * Returns **component-wise** logical `or` result.
 * @example
 * or(vec2b(false, true), vec2b(false, false)) // returns vec2b(false, true)
 * or(vec3b(true, true, false), vec3b(false, true, false)) // returns vec3b(true, true, false)
 */
export const or = dualImpl({
  name: 'or',
  signature: (...argTypes) => ({ argTypes, returnType: argTypes[0] }),
  normalImpl: cpuOr,
  codegenImpl: (_ctx, [lhs, rhs]) => stitch`(${lhs} | ${rhs})`,
});

const cpuAnd = <T extends AnyBooleanVecInstance>(lhs: T, rhs: T) =>
  cpuNot(cpuOr(cpuNot(lhs), cpuNot(rhs)));

/**
 * Returns **component-wise** logical `and` result.
 * @example
 * and(vec2b(false, true), vec2b(true, true)) // returns vec2b(false, true)
 * and(vec3b(true, true, false), vec3b(false, true, false)) // returns vec3b(false, true, false)
 */
export const and = dualImpl({
  name: 'and',
  signature: (...argTypes) => ({ argTypes, returnType: argTypes[0] }),
  normalImpl: cpuAnd,
  codegenImpl: (_ctx, [lhs, rhs]) => stitch`(${lhs} & ${rhs})`,
});

// logical aggregation

const cpuAll = (value: AnyBooleanVecInstance) =>
  VectorOps.all[value.kind](value);

/**
 * Returns `true` if each component of `value` is true.
 * @example
 * all(vec2b(false, true)) // returns false
 * all(vec3b(true, true, true)) // returns true
 */
export const all = dualImpl({
  name: 'all',
  signature: (...argTypes) => ({ argTypes, returnType: bool }),
  normalImpl: cpuAll,
  codegenImpl: (_ctx, [value]) => stitch`all(${value})`,
});

/**
 * Returns `true` if any component of `value` is true.
 * @example
 * any(vec2b(false, true)) // returns true
 * any(vec3b(false, false, false)) // returns false
 */
export const any = dualImpl({
  name: 'any',
  signature: (...argTypes) => ({ argTypes, returnType: bool }),
  normalImpl: (value: AnyBooleanVecInstance) => !cpuAll(cpuNot(value)),
  codegenImpl: (_ctx, [arg]) => stitch`any(${arg})`,
});

// other

/**
 * Checks whether the given elements differ by at most the `precision` value.
 * Checks all elements of `lhs` and `rhs` if arguments are vectors.
 * @example
 * isCloseTo(0, 0.1) // returns false
 * isCloseTo(vec3f(0, 0, 0), vec3f(0.002, -0.009, 0)) // returns true
 *
 * @param {number} precision argument that specifies the maximum allowed difference, 0.01 by default.
 */
export const isCloseTo = dualImpl({
  name: 'isCloseTo',
  signature: (...args) => ({
    argTypes: args as AnyWgslData[],
    returnType: bool,
  }),
  // CPU implementation
  normalImpl: <T extends AnyFloatVecInstance | number>(
    lhs: T,
    rhs: T,
    precision = 0.01,
  ): boolean => {
    if (typeof lhs === 'number' && typeof rhs === 'number') {
      return Math.abs(lhs - rhs) < precision;
    }
    if (isVecInstance(lhs) && isVecInstance(rhs)) {
      return VectorOps.isCloseToZero[lhs.kind](sub(lhs, rhs), precision);
    }
    return false;
  },
  // GPU implementation
  codegenImpl: (
    _ctx,
    [lhs, rhs, precision = snip(0.01, f32, /* origin */ 'constant')],
  ) => {
    if (isSnippetNumeric(lhs) && isSnippetNumeric(rhs)) {
      return stitch`(abs(f32(${lhs}) - f32(${rhs})) <= ${precision})`;
    }
    if (!isSnippetNumeric(lhs) && !isSnippetNumeric(rhs)) {
      // https://www.w3.org/TR/WGSL/#vector-multi-component:~:text=Binary%20arithmetic%20expressions%20with%20mixed%20scalar%20and%20vector%20operands
      // (a-a)+prec creates a vector of a.length elements, all equal to prec
      return stitch`all(abs(${lhs} - ${rhs}) <= (${lhs} - ${lhs}) + ${precision})`;
    }
    return 'false';
  },
});

function cpuSelect(f: boolean, t: boolean, cond: boolean): boolean;
function cpuSelect(f: number, t: number, cond: boolean): number;
function cpuSelect<T extends AnyVecInstance>(
  f: T,
  t: T,
  cond:
    | boolean
    | (T extends AnyVec2Instance ? v2b
      : T extends AnyVec3Instance ? v3b
      : v4b),
): T;
function cpuSelect<T extends number | boolean | AnyVecInstance>(
  f: T,
  t: T,
  cond: AnyBooleanVecInstance | boolean,
) {
  if (typeof cond === 'boolean') {
    return cond ? t : f;
  }
  return VectorOps.select[(f as AnyVecInstance).kind](
    f as AnyVecInstance,
    t as AnyVecInstance,
    cond,
  );
}

/**
 * Returns `t` if `cond` is `true`, and `f` otherwise.
 * Component-wise if `cond` is a vector.
 * @example
 * select(1, 2, false) // returns 1
 * select(1, 2, true) // returns 2
 * select(vec2i(1, 2), vec2i(3, 4), true) // returns vec2i(3, 4)
 * select(vec2i(1, 2), vec2i(3, 4), vec2b(false, true)) // returns vec2i(1, 4)
 */
export const select = dualImpl({
  name: 'select',
  signature: (f, t, cond) => {
    const [uf, ut] = unify([f, t]) ?? [f, t] as const;
    return ({ argTypes: [uf, ut, cond], returnType: uf });
  },
  normalImpl: cpuSelect,
  codegenImpl: (_ctx, [f, t, cond]) => stitch`select(${f}, ${t}, ${cond})`,
});
