import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec4f } from '../../../src/data/index.ts';
import { isCloseTo, log2 } from '../../../src/std/index.ts';

describe('log2', () => {
  it('computes base-2 logarithm of numeric value', () => {
    expect(log2(1)).toBeCloseTo(0);
    expect(log2(2)).toBeCloseTo(1);
    expect(log2(4)).toBeCloseTo(2);
    expect(log2(8)).toBeCloseTo(3);
    expect(log2(16)).toBeCloseTo(4);
    expect(log2(0.5)).toBeCloseTo(-1);
    expect(log2(0.25)).toBeCloseTo(-2);
  });

  it('computes base-2 logarithm for vec2f', () => {
    const input = vec2f(2, 8);
    const expected = vec2f(1, 3);
    expect(isCloseTo(log2(input), expected)).toBe(true);
  });

  it('computes base-2 logarithm for vec3f', () => {
    const input = vec3f(2, 4, 16);
    const expected = vec3f(1, 2, 4);
    expect(isCloseTo(log2(input), expected)).toBe(true);
  });

  it('computes base-2 logarithm for vec4f', () => {
    const input = vec4f(1, 2, 0.5, 0.25);
    const expected = vec4f(0, 1, -1, -2);
    expect(isCloseTo(log2(input), expected)).toBe(true);
  });

  // Edge cases
  it('handles special values correctly', () => {
    expect(log2(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(log2(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(log2(-1))).toBe(true);
    const input = vec2f(-1, 2);
    const result = log2(input);
    expect(Number.isNaN(result.x)).toBe(true);
    expect(result.y).toBeCloseTo(1);
  });
});
