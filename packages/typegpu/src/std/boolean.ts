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

export type NumericToBooleanComponentWise = {
  <T extends AnyNumericVec2Instance>(s: T, v: T): v2b;
  <T extends AnyNumericVec3Instance>(s: T, v: T): v3b;
  <T extends AnyNumericVec4Instance>(s: T, v: T): v4b;
};

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

export const greaterThan: NumericToBooleanComponentWise = createDualImpl(
  // CPU implementation
  (<T extends AnyNumericVecInstance>(lhs: T, rhs: T) => {
    return and(
      neg(VectorOps.lessThan[lhs.kind](lhs, rhs)),
      neg(VectorOps.eq[lhs.kind](lhs, rhs)),
    );
  }) as NumericToBooleanComponentWise,
  // GPU implementation
  (lhs, rhs) => ({
    value: `(${lhs.value} > ${rhs.value})`,
    dataType: correspondingBooleanVectorSchema(lhs),
  }),
);

// logical ops

export const neg = createDualImpl(
  // CPU implementation
  (value: AnyBooleanVecInstance) => {
    return VectorOps.neg[value.kind](value);
  },
  // GPU implementation
  (value) => ({
    value: `!(${value.value})`,
    dataType: value.dataType,
  }),
);

export const or = createDualImpl(
  // CPU implementation
  <T extends AnyBooleanVecInstance>(lhs: T, rhs: T) => {
    return VectorOps.or[lhs.kind](lhs, rhs);
  },
  // GPU implementation
  (lhs, rhs) => ({
    value: `(${lhs.value} || ${rhs.value})`,
    dataType: lhs.dataType,
  }),
);

export const and = createDualImpl(
  // CPU implementation
  <T extends AnyBooleanVecInstance>(lhs: T, rhs: T) => {
    return neg(or(neg(lhs), neg(rhs)));
  },
  // GPU implementation
  (lhs, rhs) => ({
    value: `(${lhs.value} && ${rhs.value})`,
    dataType: lhs.dataType,
  }),
);

// logical aggregation

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

export const any = createDualImpl(
  // CPU implementation
  (value: AnyBooleanVecInstance) => {
    return VectorOps.any[value.kind](value);
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
 * Component-wise if arguments are vectors.
 * @example
 * isCloseTo(0, 0.1) // returns false
 * isCloseTo(vec3f(0, 0, 0), vec3f(0.002, -0.009, 0)) // returns true
 *
 * @param {number} precision argument that specifies the maximum allowed difference, 0.01 by default.
 */
export const isCloseTo = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(e1: T, e2: T, precision = 0.01) => {
    if (typeof e1 === 'number' && typeof e2 === 'number') {
      return Math.abs(e1 - e2) < precision;
    }
    if (typeof e1 !== 'number' && typeof e2 !== 'number') {
      return VectorOps.isCloseToZero[e1.kind](sub(e1, e2), precision);
    }
    return false;
  },
  // GPU implementation
  (e1, e2, precision = { value: 0.01, dataType: f32 }) => {
    if (isNumeric(e1) && isNumeric(e2)) {
      return {
        value: `(abs(f32(${e1.value})-f32(${e2.value})) <= ${precision.value})`,
        dataType: bool,
      };
    }
    if (!isNumeric(e1) && !isNumeric(e2)) {
      return {
        // https://www.w3.org/TR/WGSL/#vector-multi-component:~:text=Binary%20arithmetic%20expressions%20with%20mixed%20scalar%20and%20vector%20operands
        // (a-a)+prec creates a vector of a.length elements, all equal to prec
        value: `all(abs(${e1.value}-${e2.value}) <= (${e1.value} - ${e1.value})+${precision.value})`,
        dataType: bool,
      };
    }
    return {
      value: 'false',
      dataType: bool,
    };
  },
);

// AAA wszystkie compare funkcje
// AAA js docsy do wszystkich funkcji
// AAA sprawdź konstruktory (vec2f(vec2b))
// AAA sprawdź, co się dzieje z boolem w buforze
// AAA jak nic, to dopisz errora
// AAA skopiuj zachowanie z boola do vecNb
// AAA test example dla tych wszystkich funkcji
