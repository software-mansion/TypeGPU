import { describe, expect, expectTypeOf, it } from 'vitest';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

type FloatVector = d.v2f | d.v3f | d.v4f | d.v2h | d.v3h | d.v4h;
type IntegerVector = d.v2i | d.v3i | d.v4i | d.v2u | d.v3u | d.v4u;
type NumericVector = FloatVector | IntegerVector;
type SignedVector = FloatVector | d.v2i | d.v3i | d.v4i;
type WidenNumber<T> = T extends number ? number : T;

const floatUnaryNames = [
  'acos',
  'acosh',
  'asin',
  'asinh',
  'atan',
  'atanh',
  'ceil',
  'cos',
  'cosh',
  'degrees',
  'exp',
  'exp2',
  'floor',
  'fract',
  'inverseSqrt',
  'log',
  'log2',
  'round',
  'saturate',
  'sin',
  'sinh',
  'sqrt',
  'tan',
  'tanh',
  'trunc',
] as const;

const integerUnaryNames = [
  'countLeadingZeros',
  'countOneBits',
  'countTrailingZeros',
  'firstLeadingBit',
  'firstTrailingBit',
  'reverseBits',
] as const;

describe('numeric scalar-vector union overloads', () => {
  it.each(floatUnaryNames)('%s preserves floating-point vector unions', (name) => {
    const fn = std[name];
    expectTypeOf((value: number | d.v2f) => fn(value)).returns.toEqualTypeOf<number | d.v2f>();
    expectTypeOf((value: number | d.v3f) => fn(value)).returns.toEqualTypeOf<number | d.v3f>();
    expectTypeOf((value: number | d.v4f) => fn(value)).returns.toEqualTypeOf<number | d.v4f>();
    expectTypeOf((value: number | d.v2h) => fn(value)).returns.toEqualTypeOf<number | d.v2h>();
    expectTypeOf((value: number | d.v3h) => fn(value)).returns.toEqualTypeOf<number | d.v3h>();
    expectTypeOf((value: number | d.v4h) => fn(value)).returns.toEqualTypeOf<number | d.v4h>();
    expectTypeOf((value: 1.5 | d.v2f) => fn(value)).returns.toEqualTypeOf<number | d.v2f>();
    expectTypeOf((value: -1 | d.v4h) => fn(value)).returns.toEqualTypeOf<number | d.v4h>();
    expectTypeOf((value: d.v2f | d.v3h) => fn(value)).returns.toEqualTypeOf<d.v2f | d.v3h>();
    expectTypeOf(() => fn(1.5)).returns.toEqualTypeOf<number>();
    expectTypeOf(() => fn(d.vec3h())).returns.toEqualTypeOf<d.v3h>();
    const vector = <T extends FloatVector>(value: T): T => fn(value);
    const union = <T extends FloatVector>(value: T | number): T | number => fn(value);
    const literal = <T extends number | d.v2f>(value: T): WidenNumber<T> => fn(value);
    expectTypeOf(vector<d.v3h>).returns.toEqualTypeOf<d.v3h>();
    expectTypeOf(union<d.v3h>).returns.toEqualTypeOf<number | d.v3h>();
    expectTypeOf(literal<1.5 | d.v2f>).returns.toEqualTypeOf<number | d.v2f>();
    // Compile-only invalid calls: several helpers have no CPU implementation.
    if (false) {
      // @ts-expect-error Floating-point helpers exclude signed integer vectors.
      fn(d.vec2i());
      // @ts-expect-error Floating-point helpers exclude unsigned integer vectors.
      fn(d.vec2u());
      // @ts-expect-error Non-numeric values remain unsupported.
      fn(true);
    }
  });

  it.each(integerUnaryNames)('%s preserves signed and unsigned integer unions', (name) => {
    const fn = std[name];
    expectTypeOf((value: number | d.v2i) => fn(value)).returns.toEqualTypeOf<number | d.v2i>();
    expectTypeOf((value: number | d.v3i) => fn(value)).returns.toEqualTypeOf<number | d.v3i>();
    expectTypeOf((value: number | d.v4i) => fn(value)).returns.toEqualTypeOf<number | d.v4i>();
    expectTypeOf((value: number | d.v2u) => fn(value)).returns.toEqualTypeOf<number | d.v2u>();
    expectTypeOf((value: number | d.v3u) => fn(value)).returns.toEqualTypeOf<number | d.v3u>();
    expectTypeOf((value: number | d.v4u) => fn(value)).returns.toEqualTypeOf<number | d.v4u>();
    expectTypeOf((value: 4 | d.v2i) => fn(value)).returns.toEqualTypeOf<number | d.v2i>();
    expectTypeOf((value: 4 | d.v4u) => fn(value)).returns.toEqualTypeOf<number | d.v4u>();
    const vector = <T extends IntegerVector>(value: T): T => fn(value);
    const union = <T extends IntegerVector>(value: T | number): T | number => fn(value);
    const literal = <T extends number | d.v2i>(value: T): WidenNumber<T> => fn(value);
    expectTypeOf(vector<d.v3u>).returns.toEqualTypeOf<d.v3u>();
    expectTypeOf(union<d.v3u>).returns.toEqualTypeOf<number | d.v3u>();
    expectTypeOf(literal<4 | d.v2i>).returns.toEqualTypeOf<number | d.v2i>();
    if (false) {
      // @ts-expect-error Integer helpers exclude floating-point vectors.
      fn(d.vec2f());
      // @ts-expect-error Half-precision vectors are not integer vectors.
      fn(d.vec2h());
    }
  });

  it('retains the abs, sign, and quantizeToF16 vector domains', () => {
    expectTypeOf((value: number | NumericVector) => std.abs(value)).returns.toEqualTypeOf<
      number | NumericVector
    >();
    expectTypeOf((value: -2 | d.v2i) => std.abs(value)).returns.toEqualTypeOf<number | d.v2i>();
    expectTypeOf((value: 2 | d.v4u) => std.abs(value)).returns.toEqualTypeOf<number | d.v4u>();
    expectTypeOf((value: number | SignedVector) => std.sign(value)).returns.toEqualTypeOf<
      number | SignedVector
    >();
    expectTypeOf((value: number | d.v2f) => std.quantizeToF16(value)).returns.toEqualTypeOf<
      number | d.v2f
    >();
    expectTypeOf((value: number | d.v3f) => std.quantizeToF16(value)).returns.toEqualTypeOf<
      number | d.v3f
    >();
    expectTypeOf((value: 1.5 | d.v4f) => std.quantizeToF16(value)).returns.toEqualTypeOf<
      number | d.v4f
    >();
    const abs = <T extends NumericVector | number>(value: T): WidenNumber<T> => std.abs<T>(value);
    const sign = <T extends number | d.v3i>(value: T): WidenNumber<T> => std.sign(value);
    const quantize = <T extends number | d.v4f>(value: T): WidenNumber<T> =>
      std.quantizeToF16(value);
    expectTypeOf(abs<-2 | d.v4u>).returns.toEqualTypeOf<number | d.v4u>();
    expectTypeOf(sign<-2 | d.v3i>).returns.toEqualTypeOf<number | d.v3i>();
    expectTypeOf(quantize<1.5 | d.v4f>).returns.toEqualTypeOf<number | d.v4f>();
    if (false) {
      // @ts-expect-error Sign excludes unsigned vectors, including union members.
      std.sign(null as unknown as 2 | d.v4u);
      // @ts-expect-error quantizeToF16 excludes f16 vectors.
      std.quantizeToF16(d.vec2h());
      // @ts-expect-error quantizeToF16 excludes integer vectors.
      std.quantizeToF16(d.vec2i());
    }
  });

  it('retains explicit scalar type arguments and widens generic numeric literals', () => {
    expectTypeOf(() => std.abs<number>(-2)).returns.toEqualTypeOf<number>();
    expectTypeOf(() => std.radians<number>(180)).returns.toEqualTypeOf<number>();
    expectTypeOf(() => std.clamp<number>(1, 0, 2)).returns.toEqualTypeOf<number>();
    expectTypeOf(() => std.step<number>(0, 1)).returns.toEqualTypeOf<number>();
    expectTypeOf((value: 180 | d.v3h) => std.floor<d.v3h>(value)).returns.toEqualTypeOf<
      number | d.v3h
    >();
    expectTypeOf(() => std.sign<d.v3h>(180)).returns.toEqualTypeOf<number | d.v3h>();
    const radians = <T extends FloatVector | number>(value: T): WidenNumber<T> =>
      std.radians<T>(value);
    const absScalar = <T extends number>(value: T): number => std.abs(value);
    const radiansScalar = <T extends number>(value: T): number => std.radians(value);
    expectTypeOf(radians<180 | d.v3h>).returns.toEqualTypeOf<number | d.v3h>();
    expectTypeOf(absScalar<-2>).returns.toEqualTypeOf<number>();
    expectTypeOf(radiansScalar<180>).returns.toEqualTypeOf<number>();
  });

  it('length retains a scalar return for scalar-vector unions', () => {
    expectTypeOf((value: number | d.v2f) => std.length(value)).returns.toEqualTypeOf<number>();
    expectTypeOf((value: -2 | d.v4h) => std.length(value)).returns.toEqualTypeOf<number>();
    expectTypeOf((value: FloatVector) => std.length(value)).returns.toEqualTypeOf<number>();
    const measure = <T extends number | d.v2f>(value: T): number => std.length(value);
    expect(measure(-3)).toBe(3);
    expect(measure(d.vec2f(3, 4))).toBe(5);
    if (false) {
      // @ts-expect-error Length excludes integer vectors.
      std.length(d.vec2i());
    }
  });

  it('frexp and modf return unions of complete mapped result structs', () => {
    const frexp = <T extends number | d.v2f | d.v3h>(value: T) => std.frexp(value);
    const modf = <T extends number | d.v2f | d.v3h>(value: T) => std.modf(value);
    expectTypeOf(frexp<number>).returns.toEqualTypeOf<{ fract: number; exp: number }>();
    expectTypeOf(frexp<d.v2f>).returns.toEqualTypeOf<{ fract: d.v2f; exp: d.v2i }>();
    expectTypeOf(frexp<d.v3h>).returns.toEqualTypeOf<{ fract: d.v3h; exp: d.v3i }>();
    expectTypeOf(frexp<1.5 | d.v2f>).returns.toEqualTypeOf<
      { fract: number; exp: number } | { fract: d.v2f; exp: d.v2i }
    >();
    expectTypeOf(modf<number>).returns.toEqualTypeOf<{ fract: number; whole: number }>();
    expectTypeOf(modf<d.v2f>).returns.toEqualTypeOf<{ fract: d.v2f; whole: d.v2f }>();
    expectTypeOf(modf<d.v3h>).returns.toEqualTypeOf<{ fract: d.v3h; whole: d.v3h }>();
    expectTypeOf(modf<1.5 | d.v2f>).returns.toEqualTypeOf<
      { fract: number; whole: number } | { fract: d.v2f; whole: d.v2f }
    >();
    if (false) {
      // @ts-expect-error frexp excludes integer vectors.
      std.frexp(d.vec2i());
      // @ts-expect-error modf excludes integer vectors.
      std.modf(d.vec2u());
    }
  });

  it('max and min still reject explicitly supplied scalar-vector union type arguments', () => {
    expect(std.max(d.vec2f(1, 4), d.vec2f(3, 2))).toEqual(d.vec2f(3, 4));
    expect(std.min(d.vec2f(1, 4), d.vec2f(3, 2))).toEqual(d.vec2f(1, 2));
    if (false) {
      // @ts-expect-error A union type argument must not permit mismatched operand shapes.
      std.max<d.v2f | number>(d.vec2f(), 1);
      // @ts-expect-error Min has the same matching-shape requirement.
      std.min<d.v2f | number>(d.vec2f(), 1);
    }
  });
});

const cpuUnaryApply = {
  abs: (value) => std.abs(value),
  acos: (value) => std.acos(value),
  acosh: (value) => std.acosh(value),
  asin: (value) => std.asin(value),
  asinh: (value) => std.asinh(value),
  atan: (value) => std.atan(value),
  atanh: (value) => std.atanh(value),
  ceil: (value) => std.ceil(value),
  cos: (value) => std.cos(value),
  cosh: (value) => std.cosh(value),
  exp: (value) => std.exp(value),
  exp2: (value) => std.exp2(value),
  floor: (value) => std.floor(value),
  fract: (value) => std.fract(value),
  log: (value) => std.log(value),
  log2: (value) => std.log2(value),
  sign: (value) => std.sign(value),
  sin: (value) => std.sin(value),
  sinh: (value) => std.sinh(value),
  sqrt: (value) => std.sqrt(value),
  tanh: (value) => std.tanh(value),
} satisfies Record<string, (value: number | d.v2f) => number | d.v2f>;

const cpuUnaryCases = [
  ['abs', -2, 2],
  ['acos', 1, 0],
  ['acosh', 1, 0],
  ['asin', 0, 0],
  ['asinh', 0, 0],
  ['atan', 0, 0],
  ['atanh', 0, 0],
  ['ceil', 1.2, 2],
  ['cos', 0, 1],
  ['cosh', 0, 1],
  ['exp', 0, 1],
  ['exp2', 2, 4],
  ['floor', 1.7, 1],
  ['fract', 1.2, 0.2],
  ['log', 1, 0],
  ['log2', 8, 3],
  ['sign', -2, -1],
  ['sin', 0, 0],
  ['sinh', 0, 0],
  ['sqrt', 4, 2],
  ['tanh', 0, 0],
] as const;

const scalarOnlyUnaryApply = {
  degrees: (value) => std.degrees(value),
  inverseSqrt: (value) => std.inverseSqrt(value),
  radians: (value) => std.radians(value),
  round: (value) => std.round(value),
  saturate: (value) => std.saturate(value),
  tan: (value) => std.tan(value),
} satisfies Record<string, (value: number | d.v2f) => number | d.v2f>;

describe('numeric union CPU behavior', () => {
  it.each(cpuUnaryCases)('%s computes scalar and vector branches', (name, input, expected) => {
    const apply = cpuUnaryApply[name];
    expect(apply(input)).toBeCloseTo(expected);
    const result = apply(d.vec2f(input, input));
    expect(typeof result).toBe('object');
    if (typeof result !== 'number') {
      expect(result.x).toBeCloseTo(expected);
      expect(result.y).toBeCloseTo(expected);
    }
  });
  it.each([
    ['degrees', Math.PI, 180],
    ['inverseSqrt', 4, 0.5],
    ['radians', 180, Math.PI],
    ['round', 2.5, 2],
    ['saturate', 2, 1],
    ['tan', 0, 0],
  ] as const)('%s computes its scalar union branch', (name, input, expected) => {
    expect(scalarOnlyUnaryApply[name](input)).toBeCloseTo(expected);
  });
});

const derivativeNames = [
  'dpdx',
  'dpdxCoarse',
  'dpdxFine',
  'dpdy',
  'dpdyCoarse',
  'dpdyFine',
  'fwidth',
  'fwidthCoarse',
  'fwidthFine',
] as const;
const numericSubgroupNames = [
  'subgroupAdd',
  'subgroupExclusiveAdd',
  'subgroupInclusiveAdd',
  'subgroupBroadcastFirst',
  'subgroupMax',
  'subgroupMin',
  'subgroupMul',
  'subgroupExclusiveMul',
  'subgroupInclusiveMul',
  'quadSwapDiagonal',
  'quadSwapX',
  'quadSwapY',
] as const;
const integerSubgroupNames = ['subgroupAnd', 'subgroupOr', 'subgroupXor'] as const;

describe('GPU-only scalar-vector union overloads', () => {
  it.each(derivativeNames)('%s preserves f32 vector unions', (name) => {
    const fn = std[name];
    expectTypeOf((value: number | d.v2f) => fn(value)).returns.toEqualTypeOf<number | d.v2f>();
    expectTypeOf((value: number | d.v3f) => fn(value)).returns.toEqualTypeOf<number | d.v3f>();
    expectTypeOf((value: 1.5 | d.v4f) => fn(value)).returns.toEqualTypeOf<number | d.v4f>();
    const generic = <T extends number | d.v2f>(value: T): WidenNumber<T> => fn(value);
    expectTypeOf(generic<1.5 | d.v2f>).returns.toEqualTypeOf<number | d.v2f>();
    if (false) {
      // @ts-expect-error Derivatives exclude f16 vectors.
      fn(d.vec2h());
      // @ts-expect-error Derivatives exclude integer vectors.
      fn(d.vec3i());
    }
  });
  it.each(numericSubgroupNames)('%s preserves numeric union shapes', (name) => {
    const fn = std[name];
    expectTypeOf((value: number | NumericVector) => fn(value)).returns.toEqualTypeOf<
      number | NumericVector
    >();
    expectTypeOf((value: 1.5 | d.v3h) => fn(value)).returns.toEqualTypeOf<number | d.v3h>();
    expectTypeOf((value: 4 | d.v4u) => fn(value)).returns.toEqualTypeOf<number | d.v4u>();
    const generic = <T extends number | d.v2f>(value: T): WidenNumber<T> => fn(value);
    expectTypeOf(generic<1.5 | d.v2f>).returns.toEqualTypeOf<number | d.v2f>();
    if (false) {
      // @ts-expect-error Numeric subgroup operations exclude booleans.
      fn(true);
      // @ts-expect-error Numeric subgroup operations exclude boolean vectors.
      fn(d.vec2b());
    }
  });
  it.each(integerSubgroupNames)('%s retains its integer-only vector domain', (name) => {
    const fn = std[name];
    expectTypeOf((value: number | IntegerVector) => fn(value)).returns.toEqualTypeOf<
      number | IntegerVector
    >();
    expectTypeOf((value: number | d.v3i) => fn(value)).returns.toEqualTypeOf<number | d.v3i>();
    expectTypeOf((value: 4 | d.v4u) => fn(value)).returns.toEqualTypeOf<number | d.v4u>();
    if (false) {
      // @ts-expect-error Bitwise subgroup operations exclude floating-point vectors.
      fn(d.vec2f());
      // @ts-expect-error Bitwise subgroup operations exclude half-precision vectors.
      fn(d.vec2h());
    }
  });
});

describe('other unary scalar-vector union overloads', () => {
  it('not widens boolean literals and preserves boolean vector shapes', () => {
    expectTypeOf((value: boolean | d.v2b) => std.not(value)).returns.toEqualTypeOf<
      boolean | d.v2b
    >();
    expectTypeOf((value: boolean | d.v3b) => std.not(value)).returns.toEqualTypeOf<
      boolean | d.v3b
    >();
    expectTypeOf((value: true | d.v4b) => std.not(value)).returns.toEqualTypeOf<boolean | d.v4b>();
    const generic = <T extends boolean | d.v2b>(value: T): T extends boolean ? boolean : T =>
      std.not(value);
    expectTypeOf(generic<true | d.v2b>).returns.toEqualTypeOf<boolean | d.v2b>();
    const apply = (value: true | d.v3b) => std.not(value);
    expect(apply(true)).toBe(false);
    expect(apply(d.vec3b(true, false, true))).toEqual(d.vec3b(false, true, false));
    if (false) {
      // @ts-expect-error Logical negation excludes numbers.
      std.not(1);
      // @ts-expect-error Logical negation excludes numeric vectors.
      std.not(d.vec2f());
    }
  });
  it('neg widens scalar literals and preserves its signed-vector domain', () => {
    expectTypeOf((value: number | SignedVector) => std.neg(value)).returns.toEqualTypeOf<
      number | SignedVector
    >();
    expectTypeOf((value: -2 | d.v3i) => std.neg(value)).returns.toEqualTypeOf<number | d.v3i>();
    expectTypeOf((value: number | d.v4h) => std.neg(value)).returns.toEqualTypeOf<number | d.v4h>();
    const generic = <T extends number | d.v2f>(value: T): WidenNumber<T> => std.neg(value);
    expectTypeOf(generic<-2 | d.v2f>).returns.toEqualTypeOf<number | d.v2f>();
    const apply = (value: -2 | d.v2i) => std.neg(value);
    expect(apply(-2)).toBe(2);
    expect(apply(d.vec2i(-2, 2))).toEqual(d.vec2i(2, -2));
    if (false) {
      // @ts-expect-error Negation excludes unsigned vectors.
      std.neg(d.vec2u());
      // @ts-expect-error Negation excludes boolean vectors.
      std.neg(d.vec2b());
      // @ts-expect-error Negation excludes matrices.
      std.neg(d.mat2x2f());
    }
  });
});
