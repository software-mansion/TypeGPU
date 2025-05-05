import { describe, expect, it } from 'vitest';
import { vec3f } from '../../../src/data/index.ts';
import { isCloseTo, sign } from '../../../src/std/index.ts';

describe('sign', () => {
  it('computes sign of numeric value', () => {
    expect(sign(-1000)).toEqual(-1);
    expect(sign(0)).toEqual(0);
    expect(sign(2000)).toEqual(1);
  });

  it('computes sign of a numeric vector', () => {
    expect(isCloseTo(sign(vec3f(-1000, 0, 2000)), vec3f(-1, 0, 1))).toBe(true);
  });
});
