import { describe, expect, it } from 'vitest';
import { vec3f } from '../../src/data';
import { asin, isCloseTo } from '../../src/std';

describe('asin', () => {
  it('computes asin of numeric value', () => {
    expect(asin(-1)).toBeCloseTo(-Math.PI / 2);
    expect(asin(0)).toBeCloseTo(0);
    expect(asin(1)).toBeCloseTo(Math.PI / 2);
  });

  it('computes acos for two vectors', () => {
    expect(
      isCloseTo(asin(vec3f(-1, 0, 1)), vec3f(-Math.PI / 2, 0, Math.PI / 2)),
    ).toBeTruthy();
  });
});
