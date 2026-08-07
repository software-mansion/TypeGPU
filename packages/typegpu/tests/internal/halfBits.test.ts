import { describe, expect, it } from 'vitest';
import { fromHalfBits, toHalfBits } from '../../src/data/numeric.ts';

// Reference conversion using the native Float16Array (available in the test
// runtime), used to cross-check the manual implementation.
const nativeToHalfBits = (value: number): number => {
  const f16 = new Float16Array(1);
  const u16 = new Uint16Array(f16.buffer);
  f16[0] = value;
  return u16[0] as number;
};

describe('toHalfBits', () => {
  it('encodes zero and negative zero', () => {
    expect(toHalfBits(0)).toBe(0x0000);
    expect(toHalfBits(-0)).toBe(0x8000);
  });

  it('encodes NaN and infinities', () => {
    expect(toHalfBits(Number.NaN) & 0x7c00).toBe(0x7c00);
    expect(toHalfBits(Number.NaN) & 0x03ff).not.toBe(0);
    expect(toHalfBits(Number.POSITIVE_INFINITY)).toBe(0x7c00);
    expect(toHalfBits(Number.NEGATIVE_INFINITY)).toBe(0xfc00);
  });

  it('encodes normal values', () => {
    expect(toHalfBits(1)).toBe(0x3c00);
    expect(toHalfBits(-1)).toBe(0xbc00);
    expect(toHalfBits(2)).toBe(0x4000);
    expect(toHalfBits(0.5)).toBe(0x3800);
  });

  it('encodes the maximum finite half value', () => {
    expect(toHalfBits(65504)).toBe(0x7bff);
  });

  it('clamps overflow to infinity', () => {
    // Above the max finite half value (65504) but finite as f32.
    expect(toHalfBits(70000)).toBe(0x7c00);
    expect(toHalfBits(-70000)).toBe(0xfc00);
    expect(toHalfBits(1e30)).toBe(0x7c00);
  });

  it('encodes subnormals', () => {
    // Smallest positive subnormal: 2^-24.
    expect(toHalfBits(2 ** -24)).toBe(0x0001);
    // Largest subnormal: (1023/1024) * 2^-14.
    expect(toHalfBits((1023 / 1024) * 2 ** -14)).toBe(0x03ff);
    // Smallest positive normal: 2^-14.
    expect(toHalfBits(2 ** -14)).toBe(0x0400);
  });

  it('underflows tiny magnitudes to zero', () => {
    // Below half of the smallest subnormal (2^-25) rounds to zero.
    expect(toHalfBits(2 ** -30)).toBe(0x0000);
    expect(toHalfBits(-(2 ** -30))).toBe(0x8000);
  });

  it('rounds to nearest even', () => {
    // 1 + 3/2048 sits exactly between 0x3c01 and 0x3c02; ties round to even.
    const value = 1 + 3 / 2048;
    expect(toHalfBits(value)).toBe(nativeToHalfBits(value));
  });

  it('matches the native Float16Array conversion across a range', () => {
    const samples = [
      0,
      -0,
      1,
      -1,
      0.1,
      -0.1,
      1.23456,
      65504,
      65505,
      100000,
      1e-5,
      6.1e-5,
      2 ** -14,
      2 ** -24,
      2 ** -25,
      2 ** -30,
      12345.6,
      -12345.6,
    ];
    for (const s of samples) {
      expect(toHalfBits(s)).toBe(nativeToHalfBits(s));
    }
  });
});

describe('fromHalfBits', () => {
  it('decodes zero and negative zero', () => {
    expect(fromHalfBits(0x0000)).toBe(0);
    expect(Object.is(fromHalfBits(0x8000), -0)).toBe(true);
  });

  it('decodes NaN and infinities', () => {
    expect(fromHalfBits(0x7e00)).toBeNaN();
    expect(fromHalfBits(0x7c00)).toBe(Number.POSITIVE_INFINITY);
    expect(fromHalfBits(0xfc00)).toBe(Number.NEGATIVE_INFINITY);
  });

  it('decodes normal values', () => {
    expect(fromHalfBits(0x3c00)).toBe(1);
    expect(fromHalfBits(0xbc00)).toBe(-1);
    expect(fromHalfBits(0x7bff)).toBe(65504);
  });

  it('decodes subnormals with the 2^-14 scaling', () => {
    // 0x0001 is the smallest subnormal: 2^-24, NOT 1/1024.
    expect(fromHalfBits(0x0001)).toBe(2 ** -24);
    expect(fromHalfBits(0x03ff)).toBeCloseTo((1023 / 1024) * 2 ** -14, 20);
  });
});

describe('round-trip', () => {
  it('is stable for representable values', () => {
    const values = [
      0,
      -0,
      1,
      -1,
      0.5,
      2,
      65504,
      2 ** -14,
      2 ** -24,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];
    for (const v of values) {
      const roundTripped = fromHalfBits(toHalfBits(v));
      expect(Object.is(roundTripped, v)).toBe(true);
    }
  });
});
