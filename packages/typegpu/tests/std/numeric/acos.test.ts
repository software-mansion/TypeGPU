import { describe, expect, it } from 'vitest';
import { vec3f } from '../../../src/data';
import { acos, isCloseTo } from '../../../src/std';

describe('acos', () => {
  it('computes acos of numeric value', () => {
    expect(acos(-1)).toBeCloseTo(Math.PI);
    expect(acos(0)).toBeCloseTo(Math.PI / 2);
    expect(acos(1)).toBeCloseTo(0);
  });

  it('computes acos for two vectors', () => {
    expect(
      isCloseTo(acos(vec3f(-1, 0, 1)), vec3f(Math.PI, Math.PI / 2, 0)),
    ).toBe(true);
  });
});
