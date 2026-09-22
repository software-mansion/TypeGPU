import { describe, expect, expectTypeOf, it } from 'vitest';
import { vec2f, vec3f, type v2f } from 'typegpu/data';
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
    const apply = (value: number | v2f) => [sign(value), floor(value)];
    const [signed, floored] = apply(vec2f(-1.5, 2.5));

    expect(signed).toEqual(vec2f(-1, 1));
    expect(floored).toEqual(vec2f(-2, 2));
    expectTypeOf(sign(2.5 as const)).toEqualTypeOf<number>();
    expectTypeOf(floor(1.5 as const)).toEqualTypeOf<number>();
  });
});
