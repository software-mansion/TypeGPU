import { describe, expect, it } from 'vitest';
import { roundUp } from 'wigsill/mathUtils';

describe('roundUp', () => {
  it('does nothing when value is multiple of modulo', () => {
    expect(roundUp(0, 2)).toEqual(0);
    expect(roundUp(2, 2)).toEqual(2);
    expect(roundUp(4, 2)).toEqual(4);

    expect(roundUp(0, 128)).toEqual(0);
    expect(roundUp(128, 128)).toEqual(128);
    expect(roundUp(256, 128)).toEqual(256);
  });

  it('rounds positive value up', () => {
    expect(roundUp(1, 2)).toEqual(2);

    expect(roundUp(1, 128)).toEqual(128);
    expect(roundUp(127, 128)).toEqual(128);
    expect(roundUp(200, 128)).toEqual(256);
  });
});
