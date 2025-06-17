import { describe, expect, it } from 'vitest';
import { bool, f16, f32, i32, u32 } from '../src/data/index.ts';

describe('u32', () => {
  it('casts a number to u32', () => {
    expect(u32(10)).toBe(10);
    expect(u32(10.5)).toBe(10);
    expect(u32(-10)).toBe(4294967286);
    expect(u32(-10.5)).toBe(4294967286);
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
  it('casts a number to f16', () => {
    expect(f16(10)).toBe(10);
    expect(f16(10.5)).toBe(10.5);
    expect(f16(-10)).toBe(-10);
    expect(f16(-10.5)).toBe(-10.5);
    expect(f16(65504)).toBe(65504);
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
