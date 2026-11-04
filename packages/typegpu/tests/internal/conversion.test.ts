import { describe, expect, it } from 'vitest';
import { d } from 'typegpu';
import { abstractInt } from '../../src/data/numeric.ts';
import { getBestConversion } from '../../src/tgsl/conversion.ts';

describe('getBestConversion', () => {
  it('needs no conversions for identical types', () => {
    expect(getBestConversion([d.f32, d.f32])).toStrictEqual({
      targetType: d.f32,
      actions: [
        { sourceIndex: 0, action: 'none' },
        { sourceIndex: 1, action: 'none' },
      ],
      hasImplicitConversions: false,
    });
  });

  it('prefers the first target type on ties, even for identical types', () => {
    // mat3x3f -> mat3x3f and mat3x3f -> mat3x3h are both rank 0,
    // so the first target type listed wins
    expect(getBestConversion([d.mat3x3f], [d.f32, d.mat3x3f])?.targetType).toBe(d.mat3x3f);
    expect(getBestConversion([d.f32], [d.i32, d.f32])?.targetType).toBe(d.f32);
  });

  it('returns the same results on repeated calls (cached)', () => {
    const targets = [d.f32, d.i32];
    const first = getBestConversion([abstractInt, d.f32], targets);
    const second = getBestConversion([abstractInt, d.f32], targets);
    expect(second).toStrictEqual(first);
    expect(first?.targetType).toBe(d.f32);
  });

  it('keeps results for different target types separate', () => {
    expect(getBestConversion([abstractInt], [d.u32])?.targetType).toBe(d.u32);
    expect(getBestConversion([abstractInt], [d.i32])?.targetType).toBe(d.i32);
  });

  it('caches failed conversions', () => {
    const targets = [d.vec3f];
    expect(getBestConversion([d.bool], targets)).toBeUndefined();
    expect(getBestConversion([d.bool], targets)).toBeUndefined();
  });
});
