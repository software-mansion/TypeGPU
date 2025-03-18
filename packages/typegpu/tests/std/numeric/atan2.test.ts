import { describe, expect, it } from 'vitest';
import { vec4f } from '../../../src/data';
import { atan2, isCloseTo } from '../../../src/std';

describe('atan2', () => {
  it('computes atan2 of two values', () => {
    expect(atan2(0, 1)).toBeCloseTo(0);
    expect(atan2(1, 0)).toBeCloseTo(Math.PI / 2);
    expect(atan2(0, -1)).toBeCloseTo(Math.PI);
    expect(atan2(-1, 0)).toBeCloseTo(-Math.PI / 2);
  });

  it('computes atan2 for two vectors', () => {
    expect(
      isCloseTo(
        atan2(vec4f(0, 1, 0, -1), vec4f(1, 0, -1, 0)),
        vec4f(0, Math.PI / 2, Math.PI, -Math.PI / 2),
      ),
    ).toBeTruthy();
  });
});
