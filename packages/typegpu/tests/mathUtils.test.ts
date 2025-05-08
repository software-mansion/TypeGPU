import { describe, expect, it } from 'vitest';
import { roundUp } from '../src/mathUtils.ts';

describe('roundUp', () => {
  it('does nothing when value is multiple of modulo', () => {
    expect(roundUp(0, 2)).toBe(0);
    expect(roundUp(2, 2)).toBe(2);
    expect(roundUp(4, 2)).toBe(4);

    expect(roundUp(0, 128)).toBe(0);
    expect(roundUp(128, 128)).toBe(128);
    expect(roundUp(256, 128)).toBe(256);
  });

  it('rounds positive value up', () => {
    expect(roundUp(1, 2)).toBe(2);

    expect(roundUp(1, 128)).toBe(128);
    expect(roundUp(127, 128)).toBe(128);
    expect(roundUp(200, 128)).toBe(256);
  });
});
