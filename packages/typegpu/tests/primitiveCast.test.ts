import { describe, expect, it } from 'vitest';
import { f16, f32, i32, u32 } from '../src/data';

describe('u32', () => {
  it('casts a number to u32', () => {
    expect(u32(10)).toBe(10);
    expect(u32(10.5)).toBe(10);
    expect(u32(-10)).toBe(4294967286);
    expect(u32(-10.5)).toBe(0);
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
    expect(i32(4294967286)).toBe(-10);
    expect(i32(4294967286.5)).toBe(2147483647);
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
    expect(f32(4294967297)).toBe(4294967296); // 4294967297 is not exactly representable as an f32
    expect(f32(4294967297.5)).toBe(4294967296); // 4294967297.5 is not exactly representable as an f32
    expect(f32(4295029249)).toBe(4295029248); // 4295029249 is not exactly representable as an f32
  });

  it('casts a boolean to f32', () => {
    expect(f32(true)).toBe(1);
    expect(f32(false)).toBe(0);
  });
});

describe('f16', () => {
  it('casts a number to f16', () => {
    expect(f16(10)).toBe(10);
    expect(f16(10.5)).toBe(10.5);
    expect(f16(-10)).toBe(-10);
    expect(f16(-10.5)).toBe(-10.5);
    expect(f16(65536)).toBe(Number.POSITIVE_INFINITY); // 65536 is too large to represent as an f16
    expect(f16(65504)).toBe(65504); // 65504 is the largest representable number
    expect(f16(65535)).toBe(65504); // the largest number that is rounded down instead of being infinity
    expect(f16(-65536)).toBe(Number.NEGATIVE_INFINITY); // -65536 is too small to represent as an f16
    expect(f16(-65505)).toBe(-65504); // -65504 is the smallest representable number

    expect(f16(5475)).to.closeTo(5475, 4); // at this range, the precision is 4
    expect(f16(5475)).not.toBe(5475); // the number is not exactly representable
  });

  it('casts a boolean to f16', () => {
    expect(f16(true)).toBe(1);
    expect(f16(false)).toBe(0);
  });
});
