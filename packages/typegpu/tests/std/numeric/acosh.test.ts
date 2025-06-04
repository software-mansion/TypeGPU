import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec4f } from '../../../src/data/index.ts';
import { acosh, isCloseTo } from '../../../src/std/index.ts';

describe('acosh', () => {
  it('computes acosh of a number', () => {
    expect(acosh(1)).toBeCloseTo(0);
    expect(acosh(Math.cosh(1))).toBeCloseTo(1);
    expect(acosh(Math.cosh(-1))).toBeCloseTo(1);
  });

  it('computes acosh of vec2f', () => {
    const input = vec2f(1, Math.cosh(1));
    const expected = vec2f(Math.acosh(1), 1);
    expect(isCloseTo(acosh(input), expected)).toBe(true);
  });

  it('tests acosh(cosh())', () => {
    const input = vec2f(1, Math.cosh(1));
    const expected = vec2f(Math.acosh(1), Math.acosh(Math.cosh(1)));
    expect(isCloseTo(acosh(input), expected)).toBe(true);
  });

  it('computes acosh of vec3f', () => {
    const input = vec3f(1, Math.cosh(1), Math.cosh(-1));
    const expected = vec3f(
      Math.acosh(1),
      1,
      -1,
    );
    expect(isCloseTo(acosh(input), expected)).toBe(true);
  });

  it('computes acosh of vec4f', () => {
    const input = vec4f(1, Math.cosh(1), Math.cosh(-1), Math.cosh(2));
    const expected = vec4f(
      Math.acosh(1),
      1,
      -1,
      2,
    );
    expect(isCloseTo(acosh(input), expected)).toBe(true);
  });
});
