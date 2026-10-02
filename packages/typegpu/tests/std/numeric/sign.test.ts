import { describe, expect, expectTypeOf, it } from 'vitest';
import { vec2f, vec2i, vec2u, vec3f, type v2f, type v2i } from 'typegpu/data';
import { floor, isCloseTo, sign } from 'typegpu/std';

describe('sign', () => {
  it('computes sign of numeric value', () => {
    expect(sign(-1000)).toBe(-1);
    expect(sign(0)).toBe(0);
    expect(sign(2000)).toBe(1);
  });

  it('computes sign of a numeric vector', () => {
    expect(isCloseTo(sign(vec3f(-1000, 0, 2000)), vec3f(-1, 0, 1))).toBe(true);
  });

  it('accepts scalar-vector unions without preserving scalar literal types', () => {
    const apply = (value: number | v2f) => {
      expectTypeOf(sign(value)).toEqualTypeOf<number | v2f>();
      expectTypeOf(floor(value)).toEqualTypeOf<number | v2f>();
      return [sign(value), floor(value)];
    };
    const [signed, floored] = apply(vec2f(-1.5, 2.5));

    expect(signed).toEqual(vec2f(-1, 1));
    expect(floored).toEqual(vec2f(-2, 2));
    expect(apply(-1.5)).toEqual([-1, -2]);
    expectTypeOf(sign(2.5 as const)).toEqualTypeOf<number>();
    expectTypeOf(floor(1.5 as const)).toEqualTypeOf<number>();
  });

  it('widens numeric literals within scalar-vector unions', () => {
    const apply = (value: 1.5 | v2f) => {
      expectTypeOf(sign(value)).toEqualTypeOf<number | v2f>();
      expectTypeOf(floor(value)).toEqualTypeOf<number | v2f>();
      return [sign(value), floor(value)];
    };

    expect(apply(1.5)).toEqual([1, 1]);
    expect(apply(vec2f(-1.5, 2.5))).toEqual([vec2f(-1, 1), vec2f(-2, 2)]);
  });

  it('preserves generic vector return types', () => {
    const apply = <T extends v2f>(value: T): [T, T] => [sign(value), floor(value)];
    const signedInteger = <T extends v2i>(value: T): T => sign(value);

    expect(apply(vec2f(-1.5, 2.5))).toEqual([vec2f(-1, 1), vec2f(-2, 2)]);
    expect(signedInteger(vec2i(-2, 2))).toEqual(vec2i(-1, 1));
  });

  it('widens generic scalar return types', () => {
    const apply = <T extends number>(value: T) => {
      expectTypeOf(sign(value)).toEqualTypeOf<number>();
      expectTypeOf(floor(value)).toEqualTypeOf<number>();
      return [sign(value), floor(value)];
    };

    expect(apply(1.5)).toEqual([1, 1]);
  });

  it('rejects unsupported vector types', () => {
    // @ts-expect-error floor only accepts floating-point vectors
    expect(() => floor(vec2i())).toThrow('Unsupported signature');
    // @ts-expect-error sign only accepts signed vectors
    expect(() => sign(vec2u())).toThrow('Unsupported signature');
  });
});
