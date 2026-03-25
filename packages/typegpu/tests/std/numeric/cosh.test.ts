import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec4f } from '../../../src/data/index.ts';
import { cosh, isCloseTo } from '../../../src/std/index.ts';

describe('cosh', () => {
  it('computes cosh of a number', () => {
    expect(cosh(0)).toBeCloseTo(1);
    expect(cosh(1)).toBeCloseTo(Math.cosh(1));
    expect(cosh(-1)).toBeCloseTo(Math.cosh(-1));
  });

  it('computes cosh of vec2f', () => {
    const input = vec2f(0, 1);
    const expected = vec2f(Math.cosh(0), Math.cosh(1));
    expect(isCloseTo(cosh(input), expected)).toBe(true);
  });

  it('computes cosh of vec3f', () => {
    const input = vec3f(0, 1, -1);
    const expected = vec3f(Math.cosh(0), Math.cosh(1), Math.cosh(-1));
    expect(isCloseTo(cosh(input), expected)).toBe(true);
  });

  it('computes cosh of vec4f', () => {
    const input = vec4f(0, 1, -1, 2);
    const expected = vec4f(Math.cosh(0), Math.cosh(1), Math.cosh(-1), Math.cosh(2));
    expect(isCloseTo(cosh(input), expected)).toBe(true);
  });
});
