import { bool, f32 } from '../data/numeric.ts';
import { vec2b, vec3b, vec4b } from '../data/vector.ts';
import { VectorOps } from '../data/vectorOps.ts';
import type {
  AnyBooleanVecInstance,
  AnyFloatVecInstance,
  AnyNumericVecInstance,
  AnyVec2Instance,
  AnyVec3Instance,
  AnyVecInstance,
  ScalarData,
  v2b,
  v3b,
  v4b,
} from '../data/wgslTypes.ts';
import { createDualImpl } from '../shared/generators.ts';
import type { Snippet } from '../types.ts';
import { snippetIsNumeric, sub } from './numeric.ts';

function correspondingBooleanVectorSchema(value: Snippet) {
  if (value.dataType.type.includes('2')) {
    return vec2b;
  }
  if (value.dataType.type.includes('3')) {
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
export const allEq = createDualImpl(
  // CPU implementation
  <T extends AnyVecInstance>(lhs: T, rhs: T) => all(eq(lhs, rhs)),
  // GPU implementation
  (lhs, rhs) => ({
    value: `all(${lhs.value} == ${rhs.value})`,
    dataType: bool,
  }),
);

/**
 * Checks **component-wise** whether `lhs == rhs`.
 * This function does **not** return `bool`, for that use-case, wrap the result in `all`, or use `allEq`.
 * @example
 * eq(vec2f(0.0, 1.0), vec2f(0.0, 2.0)) // returns vec2b(true, false)
 * eq(vec3u(0, 1, 2), vec3u(2, 1, 0)) // returns vec3b(false, true, false)
 * all(eq(vec4i(4, 3, 2, 1), vec4i(4, 3, 2, 1))) // returns true
 * allEq(vec4i(4, 3, 2, 1), vec4i(4, 3, 2, 1)) // returns true
 */
export const eq = createDualImpl(
  // CPU implementation
  <T extends AnyVecInstance>(lhs: T, rhs: T) =>
    VectorOps.eq[lhs.kind](lhs, rhs),
  // GPU implementation
  (lhs, rhs) => ({
    value: `(${lhs.value} == ${rhs.value})`,
    dataType: correspondingBooleanVectorSchema(lhs),
  }),
);

/**
 * Checks **component-wise** whether `lhs != rhs`.
 * This function does **not** return `bool`, for that use-case, wrap the result in `any`.
 * @example
 * ne(vec2f(0.0, 1.0), vec2f(0.0, 2.0)) // returns vec2b(false, true)
 * ne(vec3u(0, 1, 2), vec3u(2, 1, 0)) // returns vec3b(true, false, true)
 * any(ne(vec4i(4, 3, 2, 1), vec4i(4, 2, 2, 1))) // returns true
 */
export const ne = createDualImpl(
  // CPU implementation
  <T extends AnyVecInstance>(lhs: T, rhs: T) => not(eq(lhs, rhs)),
  // GPU implementation
  (lhs, rhs) => ({
    value: `(${lhs.value} != ${rhs.value})`,
    dataType: correspondingBooleanVectorSchema(lhs),
  }),
);

/**
 * Checks **component-wise** whether `lhs < rhs`.
 * This function does **not** return `bool`, for that use-case, wrap the result in `all`.
 * @example
 * lt(vec2f(0.0, 0.0), vec2f(0.0, 1.0)) // returns vec2b(false, true)
 * lt(vec3u(0, 1, 2), vec3u(2, 1, 0)) // returns vec3b(true, false, false)
 * all(lt(vec4i(1, 2, 3, 4), vec4i(2, 3, 4, 5))) // returns true
 */
export const lt = createDualImpl(
  // CPU implementation
  <T extends AnyNumericVecInstance>(lhs: T, rhs: T) =>
    VectorOps.lt[lhs.kind](lhs, rhs),
  // GPU implementation
  (lhs, rhs) => ({
    value: `(${lhs.value} < ${rhs.value})`,
    dataType: correspondingBooleanVectorSchema(lhs),
  }),
);

/**
 * Checks **component-wise** whether `lhs <= rhs`.
 * This function does **not** return `bool`, for that use-case, wrap the result in `all`.
 * @example
 * le(vec2f(0.0, 0.0), vec2f(0.0, 1.0)) // returns vec2b(true, true)
 * le(vec3u(0, 1, 2), vec3u(2, 1, 0)) // returns vec3b(true, true, false)
 * all(le(vec4i(1, 2, 3, 4), vec4i(2, 3, 3, 5))) // returns true
 */
export const le = createDualImpl(
  // CPU implementation
  <T extends AnyNumericVecInstance>(lhs: T, rhs: T) =>
    or(lt(lhs, rhs), eq(lhs, rhs)),
  // GPU implementation
  (lhs, rhs) => ({
    value: `(${lhs.value} <= ${rhs.value})`,
    dataType: correspondingBooleanVectorSchema(lhs),
  }),
);

/**
 * Checks **component-wise** whether `lhs > rhs`.
 * This function does **not** return `bool`, for that use-case, wrap the result in `all`.
 * @example
 * gt(vec2f(0.0, 0.0), vec2f(0.0, 1.0)) // returns vec2b(false, false)
 * gt(vec3u(0, 1, 2), vec3u(2, 1, 0)) // returns vec3b(false, false, true)
 * all(gt(vec4i(2, 3, 4, 5), vec4i(1, 2, 3, 4))) // returns true
 */
export const gt = createDualImpl(
  // CPU implementation
  <T extends AnyNumericVecInstance>(lhs: T, rhs: T) =>
    and(not(lt(lhs, rhs)), not(eq(lhs, rhs))),
  // GPU implementation
  (lhs, rhs) => ({
    value: `(${lhs.value} > ${rhs.value})`,
    dataType: correspondingBooleanVectorSchema(lhs),
  }),
);

/**
 * Checks **component-wise** whether `lhs >= rhs`.
 * This function does **not** return `bool`, for that use-case, wrap the result in `all`.
 * @example
 * ge(vec2f(0.0, 0.0), vec2f(0.0, 1.0)) // returns vec2b(true, false)
 * ge(vec3u(0, 1, 2), vec3u(2, 1, 0)) // returns vec3b(false, true, true)
 * all(ge(vec4i(2, 2, 4, 5), vec4i(1, 2, 3, 4))) // returns true
 */
export const ge = createDualImpl(
  // CPU implementation
  <T extends AnyNumericVecInstance>(lhs: T, rhs: T) => not(lt(lhs, rhs)),
  // GPU implementation
  (lhs, rhs) => ({
    value: `(${lhs.value} >= ${rhs.value})`,
    dataType: correspondingBooleanVectorSchema(lhs),
  }),
);

// logical ops

/**
 * Returns **component-wise** `!value`.
 * @example
 * not(vec2b(false, true)) // returns vec2b(true, false)
 * not(vec3b(true, true, false)) // returns vec3b(false, false, true)
 */
export const not = createDualImpl(
  // CPU implementation
  <T extends AnyBooleanVecInstance>(value: T): T =>
    VectorOps.neg[value.kind](value),
  // GPU implementation
  (value) => ({
    value: `!(${value.value})`,
    dataType: value.dataType,
  }),
);

/**
 * Returns **component-wise** logical `or` result.
 * @example
 * or(vec2b(false, true), vec2b(false, false)) // returns vec2b(false, true)
 * or(vec3b(true, true, false), vec3b(false, true, false)) // returns vec3b(true, true, false)
 */
export const or = createDualImpl(
  // CPU implementation
  <T extends AnyBooleanVecInstance>(lhs: T, rhs: T) =>
    VectorOps.or[lhs.kind](lhs, rhs),
  // GPU implementation
  (lhs, rhs) => ({
    value: `(${lhs.value} | ${rhs.value})`,
    dataType: lhs.dataType,
  }),
);

/**
 * Returns **component-wise** logical `and` result.
 * @example
 * and(vec2b(false, true), vec2b(true, true)) // returns vec2b(false, true)
 * and(vec3b(true, true, false), vec3b(false, true, false)) // returns vec3b(false, true, false)
 */
export const and = createDualImpl(
  // CPU implementation
  <T extends AnyBooleanVecInstance>(lhs: T, rhs: T) =>
    not(or(not(lhs), not(rhs))),
  // GPU implementation
  (lhs, rhs) => ({
    value: `(${lhs.value} & ${rhs.value})`,
    dataType: lhs.dataType,
  }),
);

// logical aggregation

/**
 * Returns `true` if each component of `value` is true.
 * @example
 * all(vec2b(false, true)) // returns false
 * all(vec3b(true, true, true)) // returns true
 */
export const all = createDualImpl(
  // CPU implementation
  (value: AnyBooleanVecInstance) => VectorOps.all[value.kind](value),
  // GPU implementation
  (value) => ({
    value: `all(${value.value})`,
    dataType: bool,
  }),
);

/**
 * Returns `true` if any component of `value` is true.
 * @example
 * any(vec2b(false, true)) // returns true
 * any(vec3b(false, false, false)) // returns false
 */
export const any = createDualImpl(
  // CPU implementation
  (value: AnyBooleanVecInstance) => !all(not(value)),
  // GPU implementation
  (value) => ({
    value: `any(${value.value})`,
    dataType: bool,
  }),
);

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
export const isCloseTo = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(
    lhs: T,
    rhs: T,
    precision = 0.01,
  ) => {
    if (typeof lhs === 'number' && typeof rhs === 'number') {
      return Math.abs(lhs - rhs) < precision;
    }
    if (typeof lhs !== 'number' && typeof rhs !== 'number') {
      return VectorOps.isCloseToZero[lhs.kind](sub(lhs, rhs), precision);
    }
    return false;
  },
  // GPU implementation
  (lhs, rhs, precision = { value: 0.01, dataType: f32 }) => {
    if (snippetIsNumeric(lhs) && snippetIsNumeric(rhs)) {
      return {
        value: `(abs(f32(${lhs.value}) - f32(${rhs.value})) <= ${precision.value})`,
        dataType: bool,
      };
    }
    if (!snippetIsNumeric(lhs) && !snippetIsNumeric(rhs)) {
      return {
        // https://www.w3.org/TR/WGSL/#vector-multi-component:~:text=Binary%20arithmetic%20expressions%20with%20mixed%20scalar%20and%20vector%20operands
        // (a-a)+prec creates a vector of a.length elements, all equal to prec
        value: `all(abs(${lhs.value} - ${rhs.value}) <= (${lhs.value} - ${lhs.value}) + ${precision.value})`,
        dataType: bool,
      };
    }
    return {
      value: 'false',
      dataType: bool,
    };
  },
);

export type SelectOverload = {
  <T extends ScalarData | AnyVecInstance>(f: T, t: T, cond: boolean): T;
  <T extends AnyVecInstance>(
    f: T,
    t: T,
    cond: T extends AnyVec2Instance
      ? v2b
      : T extends AnyVec3Instance
        ? v3b
        : v4b,
  ): T;
};

/**
 * Returns `t` if `cond` is `true`, and `f` otherwise.
 * Component-wise if `cond` is a vector.
 * @example
 * select(vec2i(1, 2), vec2i(3, 4), true) // returns vec2i(3, 4)
 * select(vec2i(1, 2), vec2i(3, 4), vec2b(false, true)) // returns vec2i(1, 4)
 */
export const select: SelectOverload = createDualImpl(
  // CPU implementation
  <T extends AnyVecInstance | ScalarData>(
    f: T,
    t: T,
    cond: AnyBooleanVecInstance | boolean,
  ) => {
    if (typeof cond === 'boolean') {
      return cond ? t : f;
    }
    return VectorOps.select[(f as AnyVecInstance).kind](
      f as AnyVecInstance,
      t as AnyVecInstance,
      cond,
    );
  },
  // GPU implementation
  (f, t, cond) => ({
    value: `select(${f.value}, ${t.value}, ${cond.value})`,
    dataType: f.dataType,
  }),
);
