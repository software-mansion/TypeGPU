import { bool, f32, vec2b, vec3b, vec4b } from '../data';
import { VectorOps } from '../data/vectorOps';
import type {
  AnyBooleanVecInstance,
  AnyFloatVecInstance,
  AnyNumericVec2Instance,
  AnyNumericVec3Instance,
  AnyNumericVec4Instance,
  AnyNumericVecInstance,
  AnyVec2Instance,
  AnyVec3Instance,
  AnyVec4Instance,
  AnyVecInstance,
  ScalarData,
  v2b,
  v3b,
  v4b,
} from '../data/wgslTypes';
import { createDualImpl } from '../shared/generators';
import type { Resource } from '../types';
import { isNumeric, sub } from './numeric';

function correspondingBooleanVectorSchema(value: Resource) {
  if (value.dataType.type.includes('2')) {
    return vec2b;
  }
  if (value.dataType.type.includes('3')) {
    return vec3b;
  }
  return vec4b;
}

// comparison

export type AnyToBooleanComponentWise = {
  <T extends AnyVec2Instance>(s: T, v: T): v2b;
  <T extends AnyVec3Instance>(s: T, v: T): v3b;
  <T extends AnyVec4Instance>(s: T, v: T): v4b;
};

/**
 * Checks whether `lhs == rhs` on all components.
 * Equivalent to `all(eq(lhs, rhs))`.
 * @example
 * allEq(vec2f(0.0, 1.0), vec2f(0.0, 2.0)) // returns false
 * allEq(vec3u(0, 1, 2), vec3u(0, 1, 2)) // returns true
 */
export const allEq = createDualImpl(
  // CPU implementation
  <T extends AnyVecInstance>(lhs: T, rhs: T) => {
    return all(VectorOps.eq[lhs.kind](lhs, rhs));
  },
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
export const eq: AnyToBooleanComponentWise = createDualImpl(
  // CPU implementation
  (<T extends AnyVecInstance>(lhs: T, rhs: T) => {
    return VectorOps.eq[lhs.kind](lhs, rhs);
  }) as AnyToBooleanComponentWise,
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
 * neq(vec2f(0.0, 1.0), vec2f(0.0, 2.0)) // returns vec2b(false, true)
 * neq(vec3u(0, 1, 2), vec3u(2, 1, 0)) // returns vec3b(true, false, true)
 * any(neq(vec4i(4, 3, 2, 1), vec4i(4, 2, 2, 1))) // returns true
 */
export const neq: AnyToBooleanComponentWise = createDualImpl(
  // CPU implementation
  (<T extends AnyVecInstance>(lhs: T, rhs: T) => {
    return not(VectorOps.eq[lhs.kind](lhs, rhs));
  }) as AnyToBooleanComponentWise,
  // GPU implementation
  (lhs, rhs) => ({
    value: `(${lhs.value} != ${rhs.value})`,
    dataType: correspondingBooleanVectorSchema(lhs),
  }),
);

export type NumericToBooleanComponentWise = {
  <T extends AnyNumericVec2Instance>(s: T, v: T): v2b;
  <T extends AnyNumericVec3Instance>(s: T, v: T): v3b;
  <T extends AnyNumericVec4Instance>(s: T, v: T): v4b;
};

/**
 * Checks **component-wise** whether `lhs < rhs`.
 * This function does **not** return `bool`, for that use-case, wrap the result in `all`.
 * @example
 * lessThan(vec2f(0.0, 0.0), vec2f(0.0, 1.0)) // returns vec2b(false, true)
 * lessThan(vec3u(0, 1, 2), vec3u(2, 1, 0)) // returns vec3b(true, false, false)
 * all(lessThan(vec4i(1, 2, 3, 4), vec4i(2, 3, 4, 5))) // returns true
 */
export const lessThan: NumericToBooleanComponentWise = createDualImpl(
  // CPU implementation
  (<T extends AnyNumericVecInstance>(lhs: T, rhs: T) => {
    return VectorOps.lessThan[lhs.kind](lhs, rhs);
  }) as NumericToBooleanComponentWise,
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
 * lessThanOrEqual(vec2f(0.0, 0.0), vec2f(0.0, 1.0)) // returns vec2b(true, true)
 * lessThanOrEqual(vec3u(0, 1, 2), vec3u(2, 1, 0)) // returns vec3b(true, true, false)
 * all(lessThanOrEqual(vec4i(1, 2, 3, 4), vec4i(2, 3, 3, 5))) // returns true
 */
export const lessThanOrEqual: NumericToBooleanComponentWise = createDualImpl(
  // CPU implementation
  (<T extends AnyNumericVecInstance>(lhs: T, rhs: T) => {
    return or(
      VectorOps.lessThan[lhs.kind](lhs, rhs),
      VectorOps.eq[lhs.kind](lhs, rhs),
    );
  }) as NumericToBooleanComponentWise,
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
 * greaterThan(vec2f(0.0, 0.0), vec2f(0.0, 1.0)) // returns vec2b(false, false)
 * greaterThan(vec3u(0, 1, 2), vec3u(2, 1, 0)) // returns vec3b(false, false, true)
 * all(greaterThan(vec4i(2, 3, 4, 5), vec4i(1, 2, 3, 4))) // returns true
 */
export const greaterThan: NumericToBooleanComponentWise = createDualImpl(
  // CPU implementation
  (<T extends AnyNumericVecInstance>(lhs: T, rhs: T) => {
    return and(
      not(VectorOps.lessThan[lhs.kind](lhs, rhs)),
      not(VectorOps.eq[lhs.kind](lhs, rhs)),
    );
  }) as NumericToBooleanComponentWise,
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
 * greaterThanOrEqual(vec2f(0.0, 0.0), vec2f(0.0, 1.0)) // returns vec2b(true, false)
 * greaterThanOrEqual(vec3u(0, 1, 2), vec3u(2, 1, 0)) // returns vec3b(false, true, true)
 * all(greaterThanOrEqual(vec4i(2, 2, 4, 5), vec4i(1, 2, 3, 4))) // returns true
 */
export const greaterThanOrEqual: NumericToBooleanComponentWise = createDualImpl(
  // CPU implementation
  (<T extends AnyNumericVecInstance>(lhs: T, rhs: T) => {
    return not(VectorOps.lessThan[lhs.kind](lhs, rhs));
  }) as NumericToBooleanComponentWise,
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
  <T extends AnyBooleanVecInstance>(value: T): T => {
    return VectorOps.neg[value.kind](value);
  },
  // GPU implementation
  (value) => ({
    value: `!(${value.value})`,
    dataType: value.dataType,
  }),
);

/**
 * Returns **component-wise** `lhs | rhs`.
 * @example
 * or(vec2b(false, true), vec2b(false, false)) // returns vec2b(true, false)
 * or(vec3b(true, true, false), vec3b(false, true, false)) // returns vec3b(true, true, false)
 */
export const or = createDualImpl(
  // CPU implementation
  <T extends AnyBooleanVecInstance>(lhs: T, rhs: T) => {
    return VectorOps.or[lhs.kind](lhs, rhs);
  },
  // GPU implementation
  (lhs, rhs) => ({
    value: `(${lhs.value} | ${rhs.value})`,
    dataType: lhs.dataType,
  }),
);

/**
 * Returns **component-wise** `lhs & rhs`.
 * @example
 * and(vec2b(false, true), vec2b(true, true)) // returns vec2b(true, false)
 * and(vec3b(true, true, false), vec3b(false, true, false)) // returns vec3b(false, true, false)
 */
export const and = createDualImpl(
  // CPU implementation
  <T extends AnyBooleanVecInstance>(lhs: T, rhs: T) => {
    return not(or(not(lhs), not(rhs)));
  },
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
  (value: AnyBooleanVecInstance) => {
    return VectorOps.all[value.kind](value);
  },
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
  (value: AnyBooleanVecInstance) => {
    return !all(not(value));
  },
  // GPU implementation
  (value) => ({
    value: `any(${value.value})`,
    dataType: bool,
  }),
);

// other

/**
 * Checks whether the given elements differ by at most 0.01.
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
    if (isNumeric(lhs) && isNumeric(rhs)) {
      return {
        value: `(abs(f32(${lhs.value})-f32(${rhs.value})) <= ${precision.value})`,
        dataType: bool,
      };
    }
    if (!isNumeric(lhs) && !isNumeric(rhs)) {
      return {
        // https://www.w3.org/TR/WGSL/#vector-multi-component:~:text=Binary%20arithmetic%20expressions%20with%20mixed%20scalar%20and%20vector%20operands
        // (a-a)+prec creates a vector of a.length elements, all equal to prec
        value: `all(abs(${lhs.value}-${rhs.value}) <= (${lhs.value} - ${lhs.value})+${precision.value})`,
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
  <T extends AnyVec2Instance>(f: T, t: T, cond: v2b): T;
  <T extends AnyVec3Instance>(f: T, t: T, cond: v3b): T;
  <T extends AnyVec4Instance>(f: T, t: T, cond: v4b): T;
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
