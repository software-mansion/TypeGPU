import { describe, expect, it } from 'vitest';
import { fract } from '../../../src/std';

describe('fract', () => {
  it('computes fractional part of a number', () => {
    expect(fract(2)).toBeCloseTo(0);
    expect(fract(2.2)).toBeCloseTo(0.2);
    expect(fract(-0.5)).toBeCloseTo(0.5);
    expect(fract(-0.2)).toBeCloseTo(0.8);
  });
});
