import { describe, expect, it } from 'vitest';
import { bool, f16, f32, i32, u32 } from '../src/data/index.ts';

describe('u32', () => {
  it('casts a number to u32', () => {
    expect(u32(10)).toBe(10);
    expect(u32(10.5)).toBe(10);
    expect(u32(-10)).toBe(4294967286);
    expect(u32(-10.5)).toBe(0);
    expect(u32(4294967295)).toBe(4294967295);
    expect(u32(4294967296)).toBe(0);
    expect(u32(4294967297)).toBe(1);
  });

  it('casts a boolean to u32', () => {
    expect(u32(true)).toBe(1);
    expect(u32(false)).toBe(0);
  });
});

describe('i32', () => {
  it('casts a number to i32', () => {
    expect(i32(10)).toBe(10);
    expect(i32(10.5)).toBe(10);
    expect(i32(-10)).toBe(-10);
    expect(i32(-10.5)).toBe(-10);
    expect(i32(2147483647)).toBe(2147483647);
    expect(i32(2147483648)).toBe(-2147483648);
    expect(i32(4294967286)).toBe(-10);
  });

  it('casts a boolean to i32', () => {
    expect(i32(true)).toBe(1);
    expect(i32(false)).toBe(0);
  });
});

describe('f32', () => {
  it('casts a number to f32', () => {
    expect(f32(10)).toBe(10);
    expect(f32(10.5)).toBe(10.5);
    expect(f32(-10)).toBe(-10);
    expect(f32(-10.5)).toBe(-10.5);
    expect(f32(4294967296)).toBe(4294967296);
  });

  it('casts a boolean to f32', () => {
    expect(f32(true)).toBe(1);
    expect(f32(false)).toBe(0);
  });
});

describe('f16', () => {
  it('casts typical finite numbers', () => {
    expect(f16(10)).toBe(10);
    expect(f16(10.5)).toBe(10.5);
    expect(f16(-10)).toBe(-10);
    expect(f16(-10.5)).toBe(-10.5);
  });

  it('handles the finite extrema and overflow', () => {
    // Largest finite magnitude representable is ±65504
    expect(f16(65504)).toBe(65504);
    expect(f16(-65504)).toBe(-65504);

    expect(f16(65536)).toBe(Number.POSITIVE_INFINITY);
    expect(f16(65535)).toBe(Number.POSITIVE_INFINITY);
    expect(f16(-65536)).toBe(Number.NEGATIVE_INFINITY);

    // Values just above the max finite round down to the max finite (ties‑to‑even).
    expect(f16(65505)).toBe(65504);
    expect(f16(-65505)).toBe(-65504);
  });

  it('preserves special values and signed zeros', () => {
    expect(f16(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(f16(Number.NEGATIVE_INFINITY)).toBe(Number.NEGATIVE_INFINITY);
    expect(Number.isNaN(f16(Number.NaN))).toBe(true);

    expect(Object.is(f16(0), 0)).toBe(true);
    expect(Object.is(f16(-0), -0)).toBe(true);
  });

  it('handles sub‑normals and underflow', () => {
    // Smallest positive normal is 2^-14 ≈ 6.10352e‑5
    expect(f16(6.10352e-5)).toBeCloseTo(6.10352e-5, 10);

    // Smallest positive sub‑normal is 2^-24 ≈ 5.960464e‑8
    const smallestSub = 2 ** -24;
    expect(f16(smallestSub)).toBe(smallestSub);

    // Anything smaller underflows to +0.
    expect(f16(1e-8)).toBe(0);
  });

  it('rounds arbitrary fractions correctly', () => {
    // 1/3 cannot be represented exactly; half precision rounds it to ≈ 0.333251953125.
    expect(f16(1 / 3)).toBeCloseTo(0.333251953125, 12);
  });

  it('casts a boolean to f16', () => {
    expect(f16(true)).toBe(1);
    expect(f16(false)).toBe(0);
  });
});

describe('bool', () => {
  it('correctly coerces to booleans', () => {
    expect(bool(1)).toBe(true);
    expect(bool(0)).toBe(false);
    expect(bool(-4.1)).toBe(true);
  });
});
