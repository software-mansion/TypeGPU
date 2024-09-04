import { describe, expect, it } from 'vitest';
import { std } from '../../src/std';

describe('fract', () => {
  it('computes fractional part of a number', () => {
    expect(std.fract(2)).toBeCloseTo(0);
    expect(std.fract(2.2)).toBeCloseTo(0.2);
    expect(std.fract(-0.5)).toBeCloseTo(0.5);
  });
});
