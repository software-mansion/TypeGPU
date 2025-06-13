import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec4f } from '../../../src/data/index.ts';
import { isCloseTo, log } from '../../../src/std/index.ts';

describe('log', () => {
  it('computes natural logarithm of numeric value', () => {
    expect(log(1)).toBeCloseTo(0);
    expect(log(Math.E)).toBeCloseTo(1);
    expect(log(Math.E * Math.E)).toBeCloseTo(2);
    expect(log(0.5)).toBeCloseTo(Math.log(0.5));
  });

  it('computes natural logarithm for vec2f', () => {
    const input = vec2f(1, Math.E);
    const expected = vec2f(0, 1);
    expect(isCloseTo(log(input), expected)).toBe(true);

    const input2 = vec2f(Math.E * Math.E, 0.5);
    const expected2 = vec2f(2, Math.log(0.5));
    expect(isCloseTo(log(input2), expected2)).toBe(true);
  });

  it('computes natural logarithm for vec3f', () => {
    const input = vec3f(1, Math.E, Math.E * Math.E);
    const expected = vec3f(0, 1, 2);
    expect(isCloseTo(log(input), expected)).toBe(true);
  });

  it('computes natural logarithm for vec4f', () => {
    const input = vec4f(1, Math.E, Math.E * Math.E, 0.5);
    const expected = vec4f(0, 1, 2, Math.log(0.5));
    expect(isCloseTo(log(input), expected)).toBe(true);
  });

  it('handles edge cases correctly', () => {
    expect(log(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(log(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(log(-1))).toBe(true);
  });
});
