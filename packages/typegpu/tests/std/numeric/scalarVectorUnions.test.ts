import { describe, expect, expectTypeOf, it } from 'vitest';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

type FloatVector = d.v2f | d.v3f | d.v4f | d.v2h | d.v3h | d.v4h;
type IntegerVector = d.v2i | d.v3i | d.v4i | d.v2u | d.v3u | d.v4u;
type NumericVector = FloatVector | IntegerVector;
type SignedVector = FloatVector | d.v2i | d.v3i | d.v4i;
type WidenNumber<T> = T extends number ? number : T;

// Type-check these calls without executing unsupported CPU implementations or
// intentionally invalid arguments. Runtime behavior is tested separately below.
function checkTypes<A extends unknown[]>(check: (...args: A) => void) {
  expectTypeOf(check).toBeFunction();
}

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
    checkTypes(
      (
        f2: number | d.v2f,
        f3: number | d.v3f,
        f4: number | d.v4f,
        h2: number | d.v2h,
        h3: number | d.v3h,
        h4: number | d.v4h,
        literal: 1.5 | d.v2f,
        halfLiteral: -1 | d.v4h,
        vectors: d.v2f | d.v3h,
      ) => {
        expectTypeOf(fn(f2)).toEqualTypeOf<number | d.v2f>();
        expectTypeOf(fn(f3)).toEqualTypeOf<number | d.v3f>();
        expectTypeOf(fn(f4)).toEqualTypeOf<number | d.v4f>();
        expectTypeOf(fn(h2)).toEqualTypeOf<number | d.v2h>();
        expectTypeOf(fn(h3)).toEqualTypeOf<number | d.v3h>();
        expectTypeOf(fn(h4)).toEqualTypeOf<number | d.v4h>();
        expectTypeOf(fn(literal)).toEqualTypeOf<number | d.v2f>();
        expectTypeOf(fn(halfLiteral)).toEqualTypeOf<number | d.v4h>();
        expectTypeOf(fn(vectors)).toEqualTypeOf<d.v2f | d.v3h>();
        expectTypeOf(fn(1.5)).toEqualTypeOf<number>();
        expectTypeOf(fn(d.vec3h())).toEqualTypeOf<d.v3h>();
        // @ts-expect-error Float helpers do not accept signed integer vectors.
        fn(d.vec2i());
        // @ts-expect-error Float helpers do not accept unsigned integer vectors.
        fn(d.vec2u());
        // @ts-expect-error Non-numeric values remain unsupported.
        fn(true);
      },
    );
    checkTypes(<T extends FloatVector>(value: T): T => fn(value));
    checkTypes(<T extends FloatVector>(value: T | number): T | number => fn(value));
    checkTypes(<T extends number | d.v2f>(value: T): WidenNumber<T> => fn(value));
    checkTypes(<T extends number | d.v3h>(value: T): WidenNumber<T> => fn(value));
    checkTypes(<T extends number>(value: T): number => fn(value));
  });

  it.each(integerUnaryNames)('%s preserves signed and unsigned integer unions', (name) => {
    const fn = std[name];
    checkTypes(
      (
        i2: number | d.v2i,
        i3: number | d.v3i,
        i4: number | d.v4i,
        u2: number | d.v2u,
        u3: number | d.v3u,
        u4: number | d.v4u,
        literal: 4 | d.v2i,
        unsignedLiteral: 4 | d.v4u,
      ) => {
        expectTypeOf(fn(i2)).toEqualTypeOf<number | d.v2i>();
        expectTypeOf(fn(i3)).toEqualTypeOf<number | d.v3i>();
        expectTypeOf(fn(i4)).toEqualTypeOf<number | d.v4i>();
        expectTypeOf(fn(u2)).toEqualTypeOf<number | d.v2u>();
        expectTypeOf(fn(u3)).toEqualTypeOf<number | d.v3u>();
        expectTypeOf(fn(u4)).toEqualTypeOf<number | d.v4u>();
        expectTypeOf(fn(literal)).toEqualTypeOf<number | d.v2i>();
        expectTypeOf(fn(unsignedLiteral)).toEqualTypeOf<number | d.v4u>();
        expectTypeOf(fn(4)).toEqualTypeOf<number>();
        expectTypeOf(fn(d.vec3u())).toEqualTypeOf<d.v3u>();
        // @ts-expect-error Integer helpers do not accept floating-point vectors.
        fn(d.vec2f());
        // @ts-expect-error Half-precision vectors are not integer vectors.
        fn(d.vec2h());
      },
    );
    checkTypes(<T extends IntegerVector>(value: T): T => fn(value));
    checkTypes(<T extends IntegerVector>(value: T | number): T | number => fn(value));
    checkTypes(<T extends number | d.v2i>(value: T): WidenNumber<T> => fn(value));
    checkTypes(<T extends number | d.v4u>(value: T): WidenNumber<T> => fn(value));
    checkTypes(<T extends number>(value: T): number => fn(value));
  });

  it('retains the abs, sign, and quantizeToF16 vector domains', () => {
    checkTypes(
      (
        numeric: number | NumericVector,
        signed: number | SignedVector,
        literal: -2 | d.v2i,
        unsigned: 2 | d.v4u,
        f2: number | d.v2f,
        f3: number | d.v3f,
        f4: 1.5 | d.v4f,
      ) => {
        expectTypeOf(std.abs(numeric)).toEqualTypeOf<number | NumericVector>();
        expectTypeOf(std.abs(literal)).toEqualTypeOf<number | d.v2i>();
        expectTypeOf(std.abs(unsigned)).toEqualTypeOf<number | d.v4u>();
        expectTypeOf(std.abs(-2)).toEqualTypeOf<number>();
        expectTypeOf(std.sign(signed)).toEqualTypeOf<number | SignedVector>();
        expectTypeOf(std.sign(literal)).toEqualTypeOf<number | d.v2i>();
        expectTypeOf(std.sign(-2)).toEqualTypeOf<number>();
        expectTypeOf(std.quantizeToF16(f2)).toEqualTypeOf<number | d.v2f>();
        expectTypeOf(std.quantizeToF16(f3)).toEqualTypeOf<number | d.v3f>();
        expectTypeOf(std.quantizeToF16(f4)).toEqualTypeOf<number | d.v4f>();
        expectTypeOf(std.quantizeToF16(1.5)).toEqualTypeOf<number>();
        // @ts-expect-error Sign does not accept unsigned vectors, even in unions.
        std.sign(unsigned);
        // @ts-expect-error quantizeToF16 returns f32 values and excludes f16 vectors.
        std.quantizeToF16(d.vec2h());
        // @ts-expect-error quantizeToF16 excludes integer vectors.
        std.quantizeToF16(d.vec2i());
      },
    );
    checkTypes(<T extends NumericVector>(value: T): T => std.abs(value));
    checkTypes(<T extends number | d.v2u>(value: T): WidenNumber<T> => std.abs(value));
    checkTypes(<T extends SignedVector>(value: T | number): T | number => std.sign(value));
    checkTypes(<T extends number | d.v3i>(value: T): WidenNumber<T> => std.sign(value));
    checkTypes(<T extends d.v2f | d.v3f | d.v4f>(value: T | number): T | number =>
      std.quantizeToF16(value),
    );
    checkTypes(<T extends number | d.v4f>(value: T): WidenNumber<T> => std.quantizeToF16(value));
  });

  it('retains explicit scalar type arguments for existing union-generic helpers', () => {
    checkTypes((value: 180 | d.v3h, unsigned: -2 | d.v4u) => {
      expectTypeOf(std.abs<number>(-2)).toEqualTypeOf<number>();
      expectTypeOf(std.radians<number>(180)).toEqualTypeOf<number>();
      expectTypeOf(std.clamp<number>(1, 0, 2)).toEqualTypeOf<number>();
      expectTypeOf(std.step<number>(0, 1)).toEqualTypeOf<number>();
      expectTypeOf(std.floor<d.v3h>(value)).toEqualTypeOf<number | d.v3h>();
      expectTypeOf(std.floor<d.v3h>(180)).toEqualTypeOf<number | d.v3h>();
      expectTypeOf(std.sign<d.v3h>(value)).toEqualTypeOf<number | d.v3h>();
      expectTypeOf(std.sign<d.v3h>(180)).toEqualTypeOf<number | d.v3h>();
      expectTypeOf(std.abs<-2 | d.v4u>(unsigned)).toEqualTypeOf<number | d.v4u>();
      expectTypeOf(std.radians<180 | d.v3h>(value)).toEqualTypeOf<number | d.v3h>();
      expectTypeOf(std.radians(value)).toEqualTypeOf<number | d.v3h>();
      expectTypeOf(std.radians(180)).toEqualTypeOf<number>();
      // @ts-expect-error Radians still excludes integer vectors.
      std.radians(d.vec2i());
    });
    checkTypes(<T extends NumericVector | number>(value: T): WidenNumber<T> => std.abs<T>(value));
    checkTypes(<T extends FloatVector | number>(value: T): WidenNumber<T> => std.radians<T>(value));
    checkTypes(<T extends FloatVector>(value: T): T => std.radians(value));
    checkTypes(<T extends number | d.v2f>(value: T): WidenNumber<T> => std.radians(value));
    checkTypes(<T extends number>(value: T) => {
      expectTypeOf(std.abs(value)).toEqualTypeOf<number>();
      expectTypeOf(std.radians(value)).toEqualTypeOf<number>();
    });
  });

  it('extractBits keeps scalar offset and count parameters', () => {
    checkTypes((signed: number | d.v3i, unsigned: 4 | d.v4u) => {
      expectTypeOf(std.extractBits(signed, 0, 2)).toEqualTypeOf<number | d.v3i>();
      expectTypeOf(std.extractBits(unsigned, 0, 2)).toEqualTypeOf<number | d.v4u>();
      expectTypeOf(std.extractBits(4, 0, 2)).toEqualTypeOf<number>();
      expectTypeOf(std.extractBits(d.vec2i(), 0, 2)).toEqualTypeOf<d.v2i>();
      // @ts-expect-error The payload must be an integer vector or scalar.
      std.extractBits(d.vec2f(), 0, 2);
      // @ts-expect-error Offsets remain scalar.
      std.extractBits(signed, d.vec3u(), 2);
      // @ts-expect-error Counts remain scalar.
      std.extractBits(signed, 0, d.vec3u());
    });
    checkTypes(<T extends IntegerVector>(value: T | number): T | number =>
      std.extractBits(value, 0, 2),
    );
    checkTypes(
      <T extends number | d.v2i>(value: T): WidenNumber<T> => std.extractBits(value, 0, 2),
    );
    checkTypes(
      <T extends number | d.v4u>(value: T): WidenNumber<T> => std.extractBits(value, 0, 2),
    );
  });

  it.each(['atan2', 'pow', 'step'] as const)('%s preserves same-shape binary calls', (name) => {
    const fn = std[name];
    checkTypes((value: number | d.v2f, literal: 2 | d.v4h, vectors: FloatVector) => {
      expectTypeOf(fn(value, value)).toEqualTypeOf<number | d.v2f>();
      expectTypeOf(fn(literal, literal)).toEqualTypeOf<number | d.v4h>();
      expectTypeOf(fn(vectors, vectors)).toEqualTypeOf<FloatVector>();
      expectTypeOf(fn(2, 3)).toEqualTypeOf<number>();
      expectTypeOf(fn(d.vec3h(), d.vec3h())).toEqualTypeOf<d.v3h>();
      // @ts-expect-error A scalar cannot be paired with a known vector.
      fn(2, d.vec2f());
      // @ts-expect-error A known vector cannot be paired with a scalar.
      fn(d.vec2f(), 2);
      // @ts-expect-error Vector dimensions must match.
      fn(d.vec2f(), d.vec3f());
      // @ts-expect-error Vector precisions must match.
      fn(d.vec2f(), d.vec2h());
      // @ts-expect-error Integer vectors remain unsupported.
      fn(d.vec2i(), d.vec2i());
    });
    checkTypes(<T extends FloatVector | number>(value: T): WidenNumber<T> => fn(value, value));
  });

  it.each(['fma', 'smoothstep'] as const)('%s preserves same-shape ternary calls', (name) => {
    const fn = std[name];
    checkTypes((value: number | d.v3f, literal: 2 | d.v4h, vectors: FloatVector) => {
      expectTypeOf(fn(value, value, value)).toEqualTypeOf<number | d.v3f>();
      expectTypeOf(fn(literal, literal, literal)).toEqualTypeOf<number | d.v4h>();
      expectTypeOf(fn(vectors, vectors, vectors)).toEqualTypeOf<FloatVector>();
      expectTypeOf(fn(1, 2, 3)).toEqualTypeOf<number>();
      // @ts-expect-error The first argument cannot differ in shape.
      fn(1, d.vec2f(), d.vec2f());
      // @ts-expect-error The second argument cannot differ in shape.
      fn(d.vec2f(), 1, d.vec2f());
      // @ts-expect-error The third argument cannot differ in shape.
      fn(d.vec2f(), d.vec2f(), 1);
      // @ts-expect-error Vector dimensions must match.
      fn(d.vec2f(), d.vec2f(), d.vec3f());
      // @ts-expect-error Integer vectors remain unsupported.
      fn(d.vec2i(), d.vec2i(), d.vec2i());
    });
    checkTypes(
      <T extends FloatVector | number>(value: T): WidenNumber<T> => fn(value, value, value),
    );
  });

  it('clamp supports numeric unions without widening known mixed arguments', () => {
    checkTypes((value: number | d.v2f, literal: 2 | d.v4u, vectors: NumericVector) => {
      expectTypeOf(std.clamp(value, value, value)).toEqualTypeOf<number | d.v2f>();
      expectTypeOf(std.clamp(literal, literal, literal)).toEqualTypeOf<number | d.v4u>();
      expectTypeOf(std.clamp(vectors, vectors, vectors)).toEqualTypeOf<NumericVector>();
      expectTypeOf(std.clamp(1, 2, 3)).toEqualTypeOf<number>();
      // @ts-expect-error Known scalar/vector mixtures remain invalid.
      std.clamp(d.vec2f(), 0, 1);
      // @ts-expect-error Known scalar/vector mixtures remain invalid.
      std.clamp(1, d.vec2f(), d.vec2f());
      // @ts-expect-error Vector dimensions must match.
      std.clamp(d.vec2f(), d.vec2f(), d.vec3f());
      // @ts-expect-error Signed and unsigned vector kinds must match.
      std.clamp(d.vec2i(), d.vec2u(), d.vec2i());
    });
    checkTypes(
      <T extends NumericVector | number>(value: T): WidenNumber<T> =>
        std.clamp(value, value, value),
    );
  });

  it.each(['max', 'min'] as const)('%s preserves variadic numeric union results', (name) => {
    const fn = std[name];
    checkTypes((value: number | d.v2i, literal: 2 | d.v4u, vectors: NumericVector) => {
      expectTypeOf(fn(value, value, value)).toEqualTypeOf<number | d.v2i>();
      expectTypeOf(fn(literal, literal, literal)).toEqualTypeOf<number | d.v4u>();
      expectTypeOf(fn(vectors, vectors)).toEqualTypeOf<NumericVector>();
      expectTypeOf(fn(value)).toEqualTypeOf<number | d.v2i>();
      expectTypeOf(fn(1, 2, 3)).toEqualTypeOf<number>();
      expectTypeOf(fn(d.vec3h(), d.vec3h())).toEqualTypeOf<d.v3h>();
      // @ts-expect-error At least one argument is still required.
      fn();
      // @ts-expect-error Known scalar/vector mixtures remain invalid.
      fn(1, d.vec2f());
      // @ts-expect-error Known scalar/vector mixtures remain invalid.
      fn(d.vec2f(), 1);
      // @ts-expect-error Later rest arguments must retain their vector shape.
      fn(d.vec2f(), d.vec2f(), d.vec3f());
    });
    checkTypes(
      <T extends NumericVector | number>(value: T): WidenNumber<T> => fn(value, value, value),
    );
  });

  it('mix allows scalar or matching-vector weights without mixing endpoint shapes', () => {
    checkTypes((value: number | d.v2f, literal: 2 | d.v3h, weight: number | d.v2f) => {
      expectTypeOf(std.mix(value, value, 0.5)).toEqualTypeOf<number | d.v2f>();
      expectTypeOf(std.mix(value, value, value)).toEqualTypeOf<number | d.v2f>();
      expectTypeOf(std.mix(literal, literal, 0.5)).toEqualTypeOf<number | d.v3h>();
      expectTypeOf(std.mix(d.vec2f(), d.vec2f(), weight)).toEqualTypeOf<d.v2f>();
      expectTypeOf(std.mix(d.vec3h(), d.vec3h(), 0.5)).toEqualTypeOf<d.v3h>();
      expectTypeOf(std.mix(1, 2, 0.5)).toEqualTypeOf<number>();
      // @ts-expect-error The endpoints must agree in shape.
      std.mix(1, d.vec2f(), 0.5);
      // @ts-expect-error The endpoints must agree in shape.
      std.mix(d.vec2f(), 1, 0.5);
      // @ts-expect-error Scalar endpoints do not accept a vector weight.
      std.mix(1, 2, d.vec2f());
      // @ts-expect-error Vector weights must have the endpoint shape.
      std.mix(d.vec2f(), d.vec2f(), d.vec3f());
      // @ts-expect-error Integer endpoints remain unsupported.
      std.mix(d.vec2i(), d.vec2i(), 0.5);
    });
    checkTypes(
      <T extends FloatVector | number>(value: T, weight: T | number): WidenNumber<T> =>
        std.mix(value, value, weight),
    );
  });

  it('insertBits preserves payload shape and scalar offset/count constraints', () => {
    checkTypes((value: number | d.v3i, literal: 4 | d.v4u, vectors: IntegerVector) => {
      expectTypeOf(std.insertBits(value, value, 0, 2)).toEqualTypeOf<number | d.v3i>();
      expectTypeOf(std.insertBits(literal, literal, 0, 2)).toEqualTypeOf<number | d.v4u>();
      expectTypeOf(std.insertBits(vectors, vectors, 0, 2)).toEqualTypeOf<IntegerVector>();
      expectTypeOf(std.insertBits(1, 2, 0, 2)).toEqualTypeOf<number>();
      // @ts-expect-error Payload shapes must match.
      std.insertBits(d.vec2i(), 1, 0, 2);
      // @ts-expect-error Payload shapes must match.
      std.insertBits(1, d.vec2i(), 0, 2);
      // @ts-expect-error Payload dimensions must match.
      std.insertBits(d.vec2i(), d.vec3i(), 0, 2);
      // @ts-expect-error Payload signedness must match.
      std.insertBits(d.vec2i(), d.vec2u(), 0, 2);
      // @ts-expect-error Floating-point payloads remain unsupported.
      std.insertBits(d.vec2f(), d.vec2f(), 0, 2);
      // @ts-expect-error Offset remains scalar.
      std.insertBits(value, value, d.vec3u(), 2);
      // @ts-expect-error Count remains scalar.
      std.insertBits(value, value, 0, d.vec3u());
    });
  });

  it('ldexp maps floating-point mantissas to signed exponents of the same dimension', () => {
    checkTypes(
      (
        f2: number | d.v2f,
        h2: 2 | d.v2h,
        i2: number | d.v2i,
        f3: number | d.v3f,
        h3: 2 | d.v3h,
        i3: number | d.v3i,
        f4: number | d.v4f,
        h4: 2 | d.v4h,
        i4: number | d.v4i,
        vectors: d.v2f | d.v3h,
        exponents: d.v2i | d.v3i,
      ) => {
        expectTypeOf(std.ldexp(f2, i2)).toEqualTypeOf<number | d.v2f>();
        expectTypeOf(std.ldexp(h2, i2)).toEqualTypeOf<number | d.v2h>();
        expectTypeOf(std.ldexp(f3, i3)).toEqualTypeOf<number | d.v3f>();
        expectTypeOf(std.ldexp(h3, i3)).toEqualTypeOf<number | d.v3h>();
        expectTypeOf(std.ldexp(f4, i4)).toEqualTypeOf<number | d.v4f>();
        expectTypeOf(std.ldexp(h4, i4)).toEqualTypeOf<number | d.v4h>();
        expectTypeOf(std.ldexp(vectors, exponents)).toEqualTypeOf<d.v2f | d.v3h>();
        expectTypeOf(std.ldexp(1, 2)).toEqualTypeOf<number>();
        expectTypeOf(std.ldexp(d.vec3h(), d.vec3i())).toEqualTypeOf<d.v3h>();
        // @ts-expect-error Scalar mantissas require scalar exponents.
        std.ldexp(1, d.vec2i());
        // @ts-expect-error Vector mantissas require vector exponents.
        std.ldexp(d.vec2f(), 1);
        // @ts-expect-error Exponent dimensions must match the mantissa.
        std.ldexp(d.vec2f(), d.vec3i());
        // @ts-expect-error Exponent dimensions must match the mantissa.
        std.ldexp(d.vec3h(), d.vec2i());
        // @ts-expect-error Exponent dimensions must match the mantissa.
        std.ldexp(d.vec4f(), d.vec3i());
        // @ts-expect-error Exponents must be signed integer vectors.
        std.ldexp(d.vec2f(), d.vec2u());
        // @ts-expect-error Exponents cannot be floating-point vectors.
        std.ldexp(d.vec2f(), d.vec2f());
        // @ts-expect-error Mantissas cannot be integer vectors.
        std.ldexp(d.vec2i(), d.vec2i());
      },
    );
  });

  it('length and distance retain scalar returns for scalar-vector unions', () => {
    checkTypes(<T extends number | d.v2f>(value: T): number => std.length(value));
    checkTypes(<T extends number | d.v3h>(value: T): number => std.distance(value, value));
    checkTypes((value: number | d.v2f, literal: -2 | d.v4h, vectors: FloatVector) => {
      expectTypeOf(std.length(value)).toEqualTypeOf<number>();
      expectTypeOf(std.length(literal)).toEqualTypeOf<number>();
      expectTypeOf(std.length(vectors)).toEqualTypeOf<number>();
      expectTypeOf(std.distance(value, value)).toEqualTypeOf<number>();
      expectTypeOf(std.distance(literal, literal)).toEqualTypeOf<number>();
      expectTypeOf(std.distance(vectors, vectors)).toEqualTypeOf<number>();
      // @ts-expect-error Distance still requires matching argument shapes.
      std.distance(1, d.vec2f());
      // @ts-expect-error Distance still requires matching argument shapes.
      std.distance(d.vec2f(), 1);
      // @ts-expect-error Distance still requires matching vector dimensions.
      std.distance(d.vec2f(), d.vec3f());
      // @ts-expect-error Length excludes integer vectors.
      std.length(d.vec2i());
      // @ts-expect-error Distance excludes integer vectors.
      std.distance(d.vec2i(), d.vec2i());
    });
  });

  it('frexp and modf return unions of complete mapped result structs', () => {
    const frexpGeneric = <T extends number | d.v2f | d.v3h>(value: T) => std.frexp(value);
    const modfGeneric = <T extends number | d.v2f | d.v3h>(value: T) => std.modf(value);
    checkTypes((scalar: number, vector: d.v2f, half: d.v3h, literal: 1.5 | d.v2f) => {
      expectTypeOf(frexpGeneric(scalar)).toEqualTypeOf<{ fract: number; exp: number }>();
      expectTypeOf(frexpGeneric(vector)).toEqualTypeOf<{ fract: d.v2f; exp: d.v2i }>();
      expectTypeOf(frexpGeneric(half)).toEqualTypeOf<{ fract: d.v3h; exp: d.v3i }>();
      expectTypeOf(frexpGeneric(literal)).toEqualTypeOf<
        { fract: number; exp: number } | { fract: d.v2f; exp: d.v2i }
      >();
      expectTypeOf(modfGeneric(scalar)).toEqualTypeOf<{ fract: number; whole: number }>();
      expectTypeOf(modfGeneric(vector)).toEqualTypeOf<{ fract: d.v2f; whole: d.v2f }>();
      expectTypeOf(modfGeneric(half)).toEqualTypeOf<{ fract: d.v3h; whole: d.v3h }>();
      expectTypeOf(modfGeneric(literal)).toEqualTypeOf<
        { fract: number; whole: number } | { fract: d.v2f; whole: d.v2f }
      >();
    });
    checkTypes(
      (f2: number | d.v2f, h3: 1.5 | d.v3h, f4: number | d.v4f, vectors: d.v2f | d.v3h) => {
        expectTypeOf(std.frexp(f2)).toEqualTypeOf<
          { fract: number; exp: number } | { fract: d.v2f; exp: d.v2i }
        >();
        expectTypeOf(std.frexp(h3)).toEqualTypeOf<
          { fract: number; exp: number } | { fract: d.v3h; exp: d.v3i }
        >();
        expectTypeOf(std.frexp(f4)).toEqualTypeOf<
          { fract: number; exp: number } | { fract: d.v4f; exp: d.v4i }
        >();
        expectTypeOf(std.frexp(vectors)).toEqualTypeOf<
          { fract: d.v2f; exp: d.v2i } | { fract: d.v3h; exp: d.v3i }
        >();
        expectTypeOf(std.frexp(1.5)).toEqualTypeOf<{ fract: number; exp: number }>();
        expectTypeOf(std.modf(f2)).toEqualTypeOf<
          { fract: number; whole: number } | { fract: d.v2f; whole: d.v2f }
        >();
        expectTypeOf(std.modf(h3)).toEqualTypeOf<
          { fract: number; whole: number } | { fract: d.v3h; whole: d.v3h }
        >();
        expectTypeOf(std.modf(f4)).toEqualTypeOf<
          { fract: number; whole: number } | { fract: d.v4f; whole: d.v4f }
        >();
        expectTypeOf(std.modf(vectors)).toEqualTypeOf<
          { fract: d.v2f; whole: d.v2f } | { fract: d.v3h; whole: d.v3h }
        >();
        expectTypeOf(std.modf(1.5)).toEqualTypeOf<{ fract: number; whole: number }>();
        // @ts-expect-error frexp excludes integer vectors.
        std.frexp(d.vec2i());
        // @ts-expect-error modf excludes integer vectors.
        std.modf(d.vec2u());
      },
    );
  });
});

// Give each public overload its own union-typed call. A union of differently
// constrained overloaded function types would lose their callable signatures.
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

const scalarOnlyUnaryApply = {
  degrees: (value) => std.degrees(value),
  inverseSqrt: (value) => std.inverseSqrt(value),
  radians: (value) => std.radians(value),
  round: (value) => std.round(value),
  saturate: (value) => std.saturate(value),
  tan: (value) => std.tan(value),
} satisfies Record<string, (value: number | d.v2f) => number | d.v2f>;

const unavailableUnaryApply = {
  frexp: (value) => std.frexp(value),
  modf: (value) => std.modf(value),
  quantizeToF16: (value) => std.quantizeToF16(value),
  trunc: (value) => std.trunc(value),
} satisfies Record<string, (value: number | d.v2f) => unknown>;

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
  ] as const)(
    '%s retains scalar support and its missing vector CPU implementation',
    (name, input, expected) => {
      const apply = scalarOnlyUnaryApply[name];
      expect(apply(input)).toBeCloseTo(expected);
      expect(() => apply(d.vec2f(input))).toThrow(
        `CPU implementation for ${name} on vectors not implemented yet`,
      );
    },
  );

  it('preserves implemented multiargument scalar and vector behavior', () => {
    const binary = (value: number | d.v2f) => ({
      atan2: std.atan2(value, value),
      pow: std.pow(value, value),
      distance: std.distance(value, value),
      mix: std.mix(value, value, 0.5),
      clamp: std.clamp(value, value, value),
      max: std.max(value, value, value),
      min: std.min(value, value, value),
    });
    expect(binary(2)).toEqual({
      atan2: Math.PI / 4,
      pow: 4,
      distance: 0,
      mix: 2,
      clamp: 2,
      max: 2,
      min: 2,
    });
    const vector = d.vec2f(2);
    expect(binary(vector)).toEqual({
      atan2: d.vec2f(Math.PI / 4),
      pow: d.vec2f(4),
      distance: 0,
      mix: vector,
      clamp: vector,
      max: vector,
      min: vector,
    });
    const smooth = (low: number | d.v2f, high: number | d.v2f, value: number | d.v2f) =>
      std.smoothstep(low, high, value);
    expect(smooth(0, 1, 0.5)).toBe(0.5);
    expect(smooth(d.vec2f(0), d.vec2f(1), d.vec2f(0.5))).toEqual(d.vec2f(0.5));
    const measure = (value: number | d.v2f) => std.length(value);
    expect(measure(-3)).toBe(3);
    expect(measure(d.vec2f(3, 4))).toBe(5);
  });

  it('retains step and fma scalar support and missing vector CPU implementations', () => {
    const step = (value: number | d.v2f) => std.step(value, value);
    const fma = (value: number | d.v2f) => std.fma(value, value, value);
    expect(step(2)).toBe(1);
    expect(fma(2)).toBe(6);
    expect(() => step(d.vec2f(2))).toThrow(
      'CPU implementation for step on vectors not implemented yet',
    );
    expect(() => fma(d.vec2f(2))).toThrow(
      'CPU implementation for fma on vectors not implemented yet',
    );
  });

  it.each(integerUnaryNames)('%s retains its missing CPU implementation', (name) => {
    const apply = (value: number | d.v2i) => std[name](value);
    expect(() => apply(4)).toThrow(`CPU implementation for ${name} not implemented yet`);
    expect(() => apply(d.vec2i(4))).toThrow(`CPU implementation for ${name} not implemented yet`);
  });

  it.each(['frexp', 'modf', 'quantizeToF16', 'trunc'] as const)(
    '%s retains its missing CPU implementation',
    (name) => {
      const apply = unavailableUnaryApply[name];
      expect(() => apply(1.5)).toThrow(`CPU implementation for ${name} not implemented yet`);
      expect(() => apply(d.vec2f(1.5))).toThrow(
        `CPU implementation for ${name} not implemented yet`,
      );
    },
  );

  it('retains missing extractBits, insertBits, and ldexp CPU implementations', () => {
    const extract = (value: number | d.v2i) => std.extractBits(value, 0, 2);
    const insert = (value: number | d.v2i) => std.insertBits(value, value, 0, 2);
    const ldexp = (value: number | d.v2f, exponent: number | d.v2i) => std.ldexp(value, exponent);
    for (const value of [4, d.vec2i(4)]) {
      expect(() => extract(value)).toThrow(
        'CPU implementation for extractBits not implemented yet',
      );
      expect(() => insert(value)).toThrow('CPU implementation for insertBits not implemented yet');
    }
    expect(() => ldexp(2, 2)).toThrow('CPU implementation for ldexp not implemented yet');
    expect(() => ldexp(d.vec2f(2), d.vec2i(2))).toThrow(
      'CPU implementation for ldexp not implemented yet',
    );
  });

  it('keeps runtime kind checks for independently supplied union arguments', () => {
    const binary = (a: number | d.v2f, b: number | d.v2f) => std.pow(a, b);
    const ternary = (a: number | d.v2f, b: number | d.v2f, c: number | d.v2f) => std.clamp(a, b, c);
    expect(() => binary(2, d.vec2f(2))).toThrow();
    expect(() => ternary(d.vec2f(2), 0, 1)).toThrow();
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

const indexedSubgroupNames = [
  'subgroupBroadcast',
  'subgroupShuffle',
  'subgroupShuffleDown',
  'subgroupShuffleUp',
  'subgroupShuffleXor',
  'quadBroadcast',
] as const;

describe('GPU-only scalar-vector union overloads', () => {
  it.each(derivativeNames)('%s preserves f32 vectors and its CPU error', (name) => {
    const fn = std[name];
    checkTypes((f2: number | d.v2f, f3: number | d.v3f, f4: 1.5 | d.v4f) => {
      expectTypeOf(fn(f2)).toEqualTypeOf<number | d.v2f>();
      expectTypeOf(fn(f3)).toEqualTypeOf<number | d.v3f>();
      expectTypeOf(fn(f4)).toEqualTypeOf<number | d.v4f>();
      expectTypeOf(fn(1.5)).toEqualTypeOf<number>();
      expectTypeOf(fn(d.vec2f())).toEqualTypeOf<d.v2f>();
      // @ts-expect-error Derivatives support f32 vectors, not f16 vectors.
      fn(d.vec2h());
      // @ts-expect-error Derivatives do not support signed integer vectors.
      fn(d.vec3i());
      // @ts-expect-error Derivatives do not support unsigned integer vectors.
      fn(d.vec4u());
    });
    checkTypes(<T extends d.v2f | d.v3f | d.v4f>(value: T): T => fn(value));
    checkTypes(<T extends d.v2f | d.v3f | d.v4f>(value: T | number): T | number => fn(value));
    checkTypes(<T extends number | d.v2f>(value: T): WidenNumber<T> => fn(value));
    const apply = (value: number | d.v2f) => fn(value);
    expect(() => apply(1.5)).toThrow('Derivative builtins are not allowed on the CPU');
    expect(() => apply(d.vec2f())).toThrow('Derivative builtins are not allowed on the CPU');
  });

  it.each(numericSubgroupNames)('%s preserves numeric union shapes and its CPU error', (name) => {
    const fn = std[name];
    checkTypes(
      (
        numeric: number | NumericVector,
        f2: number | d.v2f,
        h3: 1.5 | d.v3h,
        signed: number | d.v3i,
        unsigned: 4 | d.v4u,
      ) => {
        expectTypeOf(fn(numeric)).toEqualTypeOf<number | NumericVector>();
        expectTypeOf(fn(f2)).toEqualTypeOf<number | d.v2f>();
        expectTypeOf(fn(h3)).toEqualTypeOf<number | d.v3h>();
        expectTypeOf(fn(signed)).toEqualTypeOf<number | d.v3i>();
        expectTypeOf(fn(unsigned)).toEqualTypeOf<number | d.v4u>();
        expectTypeOf(fn(4)).toEqualTypeOf<number>();
        // @ts-expect-error Numeric subgroup operations exclude booleans.
        fn(true);
        // @ts-expect-error Numeric subgroup operations exclude boolean vectors.
        fn(d.vec2b());
      },
    );
    checkTypes(<T extends NumericVector>(value: T): T => fn(value));
    checkTypes(<T extends NumericVector>(value: T | number): T | number => fn(value));
    checkTypes(<T extends number | d.v2f>(value: T): WidenNumber<T> => fn(value));
    checkTypes(<T extends number | d.v3u>(value: T): WidenNumber<T> => fn(value));
    const apply = (value: number | d.v2f) => fn(value);
    expect(() => apply(4)).toThrow('Subgroup operations can only be used in the GPU context.');
    expect(() => apply(d.vec2f())).toThrow(
      'Subgroup operations can only be used in the GPU context.',
    );
  });

  it.each(integerSubgroupNames)('%s retains its integer-only vector domain', (name) => {
    const fn = std[name];
    checkTypes((integers: number | IntegerVector, signed: number | d.v3i, unsigned: 4 | d.v4u) => {
      expectTypeOf(fn(integers)).toEqualTypeOf<number | IntegerVector>();
      expectTypeOf(fn(signed)).toEqualTypeOf<number | d.v3i>();
      expectTypeOf(fn(unsigned)).toEqualTypeOf<number | d.v4u>();
      expectTypeOf(fn(4)).toEqualTypeOf<number>();
      // @ts-expect-error Bitwise subgroup operations exclude f32 vectors.
      fn(d.vec2f());
      // @ts-expect-error Bitwise subgroup operations exclude f16 vectors.
      fn(d.vec2h());
    });
    checkTypes(<T extends IntegerVector>(value: T | number): T | number => fn(value));
    checkTypes(<T extends number | d.v2i>(value: T): WidenNumber<T> => fn(value));
    const apply = (value: number | d.v2i) => fn(value);
    expect(() => apply(4)).toThrow('Subgroup operations can only be used in the GPU context.');
    expect(() => apply(d.vec2i())).toThrow(
      'Subgroup operations can only be used in the GPU context.',
    );
  });

  it.each(indexedSubgroupNames)('%s retains a scalar index, delta, or mask', (name) => {
    const fn = std[name];
    checkTypes(
      (
        numeric: number | NumericVector,
        f2: number | d.v2f,
        h3: 1.5 | d.v3h,
        signed: number | d.v3i,
        unsigned: 4 | d.v4u,
      ) => {
        expectTypeOf(fn(numeric, 0)).toEqualTypeOf<number | NumericVector>();
        expectTypeOf(fn(f2, 0)).toEqualTypeOf<number | d.v2f>();
        expectTypeOf(fn(h3, 0)).toEqualTypeOf<number | d.v3h>();
        expectTypeOf(fn(signed, 0)).toEqualTypeOf<number | d.v3i>();
        expectTypeOf(fn(unsigned, 0)).toEqualTypeOf<number | d.v4u>();
        expectTypeOf(fn(4, 0)).toEqualTypeOf<number>();
        // @ts-expect-error The control parameter remains scalar.
        fn(f2, d.vec2u());
        // @ts-expect-error Numeric payloads exclude booleans.
        fn(true, 0);
        // @ts-expect-error Numeric payloads exclude boolean vectors.
        fn(d.vec2b(), 0);
      },
    );
    checkTypes(<T extends NumericVector>(value: T | number): T | number => fn(value, 0));
    checkTypes(<T extends number | d.v2f>(value: T): WidenNumber<T> => fn(value, 0));
    checkTypes(<T extends number | d.v3u>(value: T): WidenNumber<T> => fn(value, 0));
    const apply = (value: number | d.v2f) => fn(value, 0);
    expect(() => apply(4)).toThrow('Subgroup operations can only be used in the GPU context.');
    expect(() => apply(d.vec2f())).toThrow(
      'Subgroup operations can only be used in the GPU context.',
    );
  });
});

describe('boolean scalar-vector union overloads', () => {
  it('not widens boolean literals and preserves boolean vector shapes', () => {
    checkTypes((b2: boolean | d.v2b, b3: boolean | d.v3b, literal: true | d.v4b) => {
      expectTypeOf(std.not(b2)).toEqualTypeOf<boolean | d.v2b>();
      expectTypeOf(std.not(b3)).toEqualTypeOf<boolean | d.v3b>();
      expectTypeOf(std.not(literal)).toEqualTypeOf<boolean | d.v4b>();
      expectTypeOf(std.not(true)).toEqualTypeOf<boolean>();
      expectTypeOf(std.not(d.vec3b())).toEqualTypeOf<d.v3b>();
      // @ts-expect-error Logical negation does not accept numbers.
      std.not(1);
      // @ts-expect-error Logical negation does not accept numeric vectors.
      std.not(d.vec2f());
    });
    checkTypes(<T extends d.v2b | d.v3b | d.v4b>(value: T): T => std.not(value));
    checkTypes(<T extends boolean | d.v2b>(value: T): T extends boolean ? boolean : T =>
      std.not(value),
    );
    checkTypes(<T extends d.v2b | d.v3b | d.v4b>(value: T | boolean): T | boolean =>
      std.not(value),
    );
    checkTypes(<T extends boolean>(value: T) => {
      expectTypeOf(std.not(value)).toEqualTypeOf<boolean>();
    });
    const apply = (value: true | d.v3b) => std.not(value);
    expect(apply(true)).toBe(false);
    expect(apply(d.vec3b(true, false, true))).toEqual(d.vec3b(false, true, false));
  });

  it('select preserves numeric and boolean unions with dimension-matched masks', () => {
    checkTypes(
      (
        numeric: number | d.v2f,
        numericLiteral: 2 | d.v3h,
        unsigned: number | d.v4u,
        boolean: boolean | d.v2b,
        booleanLiteral: true | d.v3b,
        mask2: boolean | d.v2b,
        mask3: boolean | d.v3b,
        mask4: boolean | d.v4b,
      ) => {
        expectTypeOf(std.select(numeric, numeric, true)).toEqualTypeOf<number | d.v2f>();
        expectTypeOf(std.select(numeric, numeric, mask2)).toEqualTypeOf<number | d.v2f>();
        expectTypeOf(std.select(numericLiteral, numericLiteral, mask3)).toEqualTypeOf<
          number | d.v3h
        >();
        expectTypeOf(std.select(unsigned, unsigned, mask4)).toEqualTypeOf<number | d.v4u>();
        expectTypeOf(std.select(boolean, boolean, mask2)).toEqualTypeOf<boolean | d.v2b>();
        expectTypeOf(std.select(booleanLiteral, booleanLiteral, mask3)).toEqualTypeOf<
          boolean | d.v3b
        >();
        expectTypeOf(std.select(1, 2, true)).toEqualTypeOf<number>();
        expectTypeOf(std.select(true, false, true)).toEqualTypeOf<boolean>();
        expectTypeOf(std.select(d.vec3h(), d.vec3h(), d.vec3b())).toEqualTypeOf<d.v3h>();
        // @ts-expect-error Known scalar/vector branch mixtures remain invalid.
        std.select(1, d.vec2f(), true);
        // @ts-expect-error Known scalar/vector branch mixtures remain invalid.
        std.select(d.vec2f(), 1, true);
        // @ts-expect-error Numeric and boolean scalar branches cannot mix.
        std.select(1, true, false);
        // @ts-expect-error Vector branch dimensions must match.
        std.select(d.vec2f(), d.vec3f(), true);
        // @ts-expect-error Numeric and boolean vector branches cannot mix.
        std.select(d.vec2f(), d.vec2b(), true);
        // @ts-expect-error Scalar branches do not accept vector masks.
        std.select(1, 2, d.vec2b());
        // @ts-expect-error Boolean scalar branches do not accept vector masks.
        std.select(true, false, d.vec2b());
        // @ts-expect-error Mask dimensions must match the branch dimension.
        std.select(d.vec2f(), d.vec2f(), d.vec3b());
        // @ts-expect-error Mask dimensions must match the branch dimension.
        std.select(d.vec3h(), d.vec3h(), d.vec4b());
        // @ts-expect-error Mask dimensions must match the branch dimension.
        std.select(d.vec4u(), d.vec4u(), d.vec2b());
        // @ts-expect-error Masks cannot be numeric vectors.
        std.select(d.vec2f(), d.vec2f(), d.vec2f());
      },
    );
    checkTypes(
      <T extends NumericVector | d.v2b | d.v3b | d.v4b>(value: T): T =>
        std.select(value, value, true),
    );
    checkTypes(<T extends number | d.v2f>(value: T): number | d.v2f =>
      std.select(value, value, true),
    );
    checkTypes(<T extends boolean | d.v2b>(value: T): boolean | d.v2b =>
      std.select(value, value, true),
    );
    const selectNumericGeneric = <T extends number | d.v2f>(value: T) =>
      std.select(value, value, true);
    const selectBooleanGeneric = <T extends boolean | d.v2b>(value: T) =>
      std.select(value, value, true);
    checkTypes((numericLiteral: 1 | d.v2f, booleanLiteral: true | d.v2b) => {
      expectTypeOf(selectNumericGeneric(1)).toEqualTypeOf<number>();
      expectTypeOf(selectNumericGeneric(d.vec2f())).toEqualTypeOf<d.v2f>();
      expectTypeOf(selectNumericGeneric(numericLiteral)).toEqualTypeOf<number | d.v2f>();
      expectTypeOf(selectBooleanGeneric(true)).toEqualTypeOf<boolean>();
      expectTypeOf(selectBooleanGeneric(d.vec2b())).toEqualTypeOf<d.v2b>();
      expectTypeOf(selectBooleanGeneric(booleanLiteral)).toEqualTypeOf<boolean | d.v2b>();
    });
    const numeric = (a: number | d.v2f, b: number | d.v2f, mask: boolean | d.v2b) =>
      std.select(a, b, mask);
    expect(numeric(1, 2, true)).toBe(2);
    expect(numeric(d.vec2f(1, 2), d.vec2f(3, 4), d.vec2b(false, true))).toEqual(d.vec2f(1, 4));
    const boolean = (a: boolean | d.v2b, b: boolean | d.v2b, mask: boolean | d.v2b) =>
      std.select(a, b, mask);
    expect(boolean(false, true, true)).toBe(true);
    expect(boolean(d.vec2b(false), d.vec2b(true), d.vec2b(false, true))).toEqual(
      d.vec2b(false, true),
    );
    expect(() => numeric(1, 2, d.vec2b(true))).toThrow();
    expect(() => numeric(1, d.vec2f(2), true)).toThrow();
  });
});

describe('arithmetic scalar-vector union overloads', () => {
  it('neg widens scalar literals and preserves its signed-vector domain', () => {
    checkTypes(
      (
        signed: number | SignedVector,
        literal: -2 | d.v3i,
        half: number | d.v4h,
        matrix: d.m2x2f,
      ) => {
        expectTypeOf(std.neg(signed)).toEqualTypeOf<number | SignedVector>();
        expectTypeOf(std.neg(literal)).toEqualTypeOf<number | d.v3i>();
        expectTypeOf(std.neg(half)).toEqualTypeOf<number | d.v4h>();
        expectTypeOf(std.neg(-2)).toEqualTypeOf<number>();
        expectTypeOf(std.neg(d.vec2h())).toEqualTypeOf<d.v2h>();
        // @ts-expect-error Negation excludes unsigned integer vectors.
        std.neg(d.vec2u());
        // @ts-expect-error Negation excludes boolean vectors.
        std.neg(d.vec2b());
        // @ts-expect-error Negation excludes matrices.
        std.neg(matrix);
      },
    );
    checkTypes(<T extends SignedVector>(value: T): T => std.neg(value));
    checkTypes(<T extends SignedVector>(value: T | number): T | number => std.neg(value));
    checkTypes(<T extends number | d.v2f>(value: T): WidenNumber<T> => std.neg(value));
    checkTypes(<T extends number | d.v3i>(value: T): WidenNumber<T> => std.neg(value));
    const apply = (value: -2 | d.v2i) => std.neg(value);
    expect(apply(-2)).toBe(2);
    expect(apply(d.vec2i(-2, 2))).toEqual(d.vec2i(2, -2));
  });

  it.each(['div', 'mod'] as const)('%s supports scalar-vector broadcasting for unions', (name) => {
    const fn = std[name];
    checkTypes(
      (
        value: number | d.v2f,
        literal: 5 | d.v3u,
        half: number | d.v4h,
        vector: d.v2f,
        matrix: d.m2x2f,
      ) => {
        expectTypeOf(fn(value, value)).toEqualTypeOf<number | d.v2f>();
        expectTypeOf(fn(value, 2)).toEqualTypeOf<number | d.v2f>();
        expectTypeOf(fn(2, value)).toEqualTypeOf<number | d.v2f>();
        expectTypeOf(fn(literal, literal)).toEqualTypeOf<number | d.v3u>();
        expectTypeOf(fn(half, half)).toEqualTypeOf<number | d.v4h>();
        expectTypeOf(fn(vector, 2)).toEqualTypeOf<d.v2f>();
        expectTypeOf(fn(2, vector)).toEqualTypeOf<d.v2f>();
        expectTypeOf(fn(5, 2)).toEqualTypeOf<number>();
        // @ts-expect-error Vector dimensions must match.
        fn(d.vec2f(), d.vec3f());
        // @ts-expect-error Vector signedness must match.
        fn(d.vec2i(), d.vec2u());
        // @ts-expect-error Vector precision must match.
        fn(d.vec2f(), d.vec2h());
        // @ts-expect-error Division and modulo exclude matrices.
        fn(matrix, matrix);
        // @ts-expect-error Division and modulo exclude matrix broadcasts.
        fn(matrix, 2);
        // @ts-expect-error Division and modulo exclude booleans.
        fn(true, false);
      },
    );
    checkTypes(<T extends NumericVector>(value: T): T => fn(value, value));
    checkTypes(<T extends NumericVector>(value: T | number): T | number => fn(value, value));
    checkTypes(<T extends number | d.v2f>(value: T): WidenNumber<T> => fn(value, value));
    checkTypes(<T extends number | d.v3u>(value: T): WidenNumber<T> => fn(value, value));
    checkTypes(<T extends number | d.v2f>(value: T): WidenNumber<T> => fn(value, 2));
    checkTypes(<T extends number | d.v2f>(value: T): WidenNumber<T> => fn(2, value));
    const apply = (lhs: number | d.v2f, rhs: number | d.v2f) => fn(lhs, rhs);
    const expected = name === 'div' ? 4 : 0;
    expect(apply(8, 2)).toBe(expected);
    expect(apply(d.vec2f(8), 2)).toEqual(d.vec2f(expected));
    expect(apply(8, d.vec2f(2))).toEqual(d.vec2f(expected));
    expect(apply(d.vec2f(8), d.vec2f(2))).toEqual(d.vec2f(expected));
  });

  it('add, sub, and mul widen numeric literal union results without changing matrix overloads', () => {
    checkTypes((value: -1 | d.v2f, matrixValue: -1 | d.m2x2f, matrix: d.m2x2f, vector: d.v2f) => {
      expectTypeOf(std.add(value, value)).toEqualTypeOf<number | d.v2f>();
      expectTypeOf(std.sub(value, value)).toEqualTypeOf<number | d.v2f>();
      expectTypeOf(std.mul(value, value)).toEqualTypeOf<number | d.v2f>();
      expectTypeOf(std.add(matrixValue, matrixValue)).toEqualTypeOf<number | d.m2x2f>();
      expectTypeOf(std.sub(matrixValue, matrixValue)).toEqualTypeOf<number | d.m2x2f>();
      expectTypeOf(std.mul(matrixValue, matrixValue)).toEqualTypeOf<number | d.m2x2f>();
      expectTypeOf(std.add<1, 1>(1, 1)).toEqualTypeOf<number>();
      expectTypeOf(std.sub<1, 1>(1, 1)).toEqualTypeOf<number>();
      expectTypeOf(std.mul<1, 1>(1, 1)).toEqualTypeOf<number>();
      expectTypeOf(std.add(vector, 1)).toEqualTypeOf<d.v2f>();
      expectTypeOf(std.sub(1, vector)).toEqualTypeOf<d.v2f>();
      expectTypeOf(std.mul(vector, 2)).toEqualTypeOf<d.v2f>();
      expectTypeOf(std.add(matrix, matrix)).toEqualTypeOf<d.m2x2f>();
      expectTypeOf(std.sub(matrix, matrix)).toEqualTypeOf<d.m2x2f>();
      expectTypeOf(std.mul(matrix, matrix)).toEqualTypeOf<d.m2x2f>();
      expectTypeOf(std.mul(matrix, vector)).toEqualTypeOf<d.v2f>();
      expectTypeOf(std.mul(vector, matrix)).toEqualTypeOf<d.v2f>();
      expectTypeOf(std.mul(matrix, 2)).toEqualTypeOf<d.m2x2f>();
      // @ts-expect-error Addition excludes matrix/scalar broadcasts.
      std.add(matrix, 1);
      // @ts-expect-error Subtraction excludes scalar/matrix broadcasts.
      std.sub(1, matrix);
      // @ts-expect-error Matrix/vector multiplication requires matching dimensions.
      std.mul(matrix, d.vec3f());
      // @ts-expect-error Vector kinds must match.
      std.add(d.vec2f(), d.vec3f());
      // @ts-expect-error Vector kinds must match.
      std.sub(d.vec2f(), d.vec3f());
      // @ts-expect-error Vector kinds must match.
      std.mul(d.vec2f(), d.vec3f());
    });
    const apply = (value: -1 | d.v2f) => [
      std.add(value, value),
      std.sub(value, value),
      std.mul(value, value),
    ];
    expect(apply(-1)).toEqual([-2, 0, 1]);
    expect(apply(d.vec2f(-1))).toEqual([d.vec2f(-2), d.vec2f(0), d.vec2f(1)]);
  });
});
