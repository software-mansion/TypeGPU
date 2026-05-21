import { describe, expect } from 'vitest';
import { abstractFloat, abstractInt } from '../../src/data/numeric.ts';
import { d } from 'typegpu';
import { getBestConversion } from '../../src/tgsl/conversion.ts';
import { it } from 'typegpu-testing-utility';
import { INTERNAL_createPtr } from '../../src/data/ptr.ts';

describe('getBestConversion', () => {
  // d.ptrPrivate(d.f32)
  const ptrF32 = INTERNAL_createPtr('private', d.f32, 'read-write', /* implicit */ true);

  it('returns result for identical types', () => {
    const res = getBestConversion([d.f32, d.f32]);
    expect(res?.targetType).toBe(d.f32);
    expect(res?.actions).toEqual([
      { sourceIndex: 0, action: 'none' },
      { sourceIndex: 1, action: 'none' },
    ]);
    expect(res?.hasImplicitConversions).toBeFalsy();
  });

  it('handles abstract types automatically', () => {
    const resFloat = getBestConversion([abstractFloat, d.f32]);
    expect(resFloat?.targetType).toBe(d.f32);
    expect(resFloat?.actions).toEqual([
      { sourceIndex: 0, action: 'none' },
      { sourceIndex: 1, action: 'none' },
    ]);
    expect(resFloat?.hasImplicitConversions).toBeFalsy();

    const resInt = getBestConversion([abstractInt, d.i32]);
    expect(resInt?.targetType).toBe(d.i32);
    expect(resInt?.actions).toEqual([
      { sourceIndex: 0, action: 'none' },
      { sourceIndex: 1, action: 'none' },
    ]);
    expect(resInt?.hasImplicitConversions).toBeFalsy();

    const resMixed = getBestConversion([abstractInt, d.f32]);
    expect(resMixed?.targetType).toBe(d.f32); // abstractInt -> f32 (rank 6)
    expect(resMixed?.actions).toEqual([
      { sourceIndex: 0, action: 'none' },
      { sourceIndex: 1, action: 'none' },
    ]);
    expect(resMixed?.hasImplicitConversions).toBeFalsy();

    const resMixed2 = getBestConversion([abstractInt, abstractFloat, d.f16]);
    expect(resMixed2?.targetType).toBe(d.f16); // abstractInt -> f16 (rank 7), abstractFloat -> f16 (rank 2)
    expect(resMixed2?.actions).toEqual([
      { sourceIndex: 0, action: 'none' },
      { sourceIndex: 1, action: 'none' },
      { sourceIndex: 2, action: 'none' },
    ]);
    expect(resMixed2?.hasImplicitConversions).toBeFalsy();
  });

  it('handles implicit casts', () => {
    const res = getBestConversion([d.i32, d.f32]);
    expect(res?.targetType).toBe(d.f32);
    expect(res?.actions).toEqual([
      { sourceIndex: 0, action: 'cast', targetType: d.f32 },
      { sourceIndex: 1, action: 'none' },
    ]);
    expect(res?.hasImplicitConversions).toBe(true);

    // Test case: [u32, f16, i32]
    // Potential targets (from input): u32, f16, i32
    // Preference: f32(0) > f16(1) > i32(2) > u32(3)
    //
    // Target f16 (pref 1):
    //   u32 (3) -> f16 (1): dest < src => rank 10
    //   f16 (1) -> f16 (1): rank 0
    //   i32 (2) -> f16 (1): dest < src => rank 10
    //   Total Rank = 10 + 0 + 10 = 20
    //
    // Target i32 (pref 2):
    //   u32 (3) -> i32 (2): dest < src => rank 10
    //   f16 (1) -> i32 (2): dest >= src => rank 20
    //   i32 (2) -> i32 (2): rank 0
    //   Total Rank = 10 + 20 + 0 = 30
    //
    // Target u32 (pref 3):
    //   u32 (3) -> u32 (3): rank 0
    //   f16 (1) -> u32 (3): dest >= src => rank 20
    //   i32 (2) -> u32 (3): dest >= src => rank 20
    //   Total Rank = 0 + 20 + 20 = 40
    //
    // Lowest rank is 20 for target f16.
    const res2Result = getBestConversion([d.u32, d.f16, d.i32]);
    expect(res2Result?.targetType).toBe(d.f16);
    expect(res2Result?.actions).toEqual([
      // Order corresponds to input [u32, f16, i32]
      { sourceIndex: 0, action: 'cast', targetType: d.f16 }, // u32 -> f16
      { sourceIndex: 1, action: 'none' }, // f16 -> f16
      { sourceIndex: 2, action: 'cast', targetType: d.f16 }, // i32 -> f16
    ]);
    expect(res2Result?.hasImplicitConversions).toBe(true);
  });

  it('handles pointer dereferencing', () => {
    const res = getBestConversion([ptrF32, d.f32]);
    expect(res?.targetType).toBe(d.f32);
    expect(res?.actions).toEqual([
      { sourceIndex: 0, action: 'deref' },
      { sourceIndex: 1, action: 'none' },
    ]);
    expect(res?.hasImplicitConversions).toBeFalsy();

    const res2 = getBestConversion([ptrF32, d.i32, d.f32]); // Target f32: deref, cast, none
    expect(res2?.targetType).toBe(d.f32);
    expect(res2?.actions).toEqual([
      { sourceIndex: 0, action: 'deref' },
      { sourceIndex: 1, action: 'cast', targetType: d.f32 }, // Implicitly derefs then casts
      { sourceIndex: 2, action: 'none' },
    ]);
    expect(res2?.hasImplicitConversions).toBe(true); // Because of the cast
  });

  it('returns undefined for incompatible types', () => {
    expect(getBestConversion([d.f32, d.vec2f])).toBeUndefined();
    expect(getBestConversion([d.struct({ a: d.f32 }), d.f32])).toBeUndefined();
  });

  it('respects targetTypes restriction', () => {
    // abstractInt -> i32 (rank 3), u32 (rank 4), f32 (rank 6), f16 (rank 7)
    // i32 -> i32 (rank 0)
    // Common types without restriction: i32
    // Restrict to f32:
    const res = getBestConversion([abstractInt, d.i32], [d.f32]);
    expect(res?.targetType).toBe(d.f32);
    expect(res?.actions).toEqual([
      { sourceIndex: 0, action: 'none' }, // abstractInt -> f32 is auto
      { sourceIndex: 1, action: 'cast', targetType: d.f32 }, // i32 -> f32 is cast
    ]);
    expect(res?.hasImplicitConversions).toBe(true);

    // Restrict to incompatible type
    const resFail = getBestConversion([abstractInt, d.i32], [d.vec2f]);
    expect(resFail).toBeUndefined();

    // Restrict to a type requiring implicit conversion for all
    const resImplicit = getBestConversion([d.i32, d.u32], [d.f32]);
    expect(resImplicit?.targetType).toBe(d.f32);
    expect(resImplicit?.actions).toEqual([
      { sourceIndex: 0, action: 'cast', targetType: d.f32 },
      { sourceIndex: 1, action: 'cast', targetType: d.f32 },
    ]);
    expect(resImplicit?.hasImplicitConversions).toBe(true);
  });

  it('can restrict abstractFloat to u32', () => {
    const res = getBestConversion([abstractFloat], [d.u32]);
    expect(res).toBeDefined();
    expect(res?.targetType).toBe(d.u32);
    expect(res?.actions).toEqual([{ sourceIndex: 0, action: 'cast', targetType: d.u32 }]);
    expect(res?.hasImplicitConversions).toBe(true);
  });

  it('handles void gracefully', () => {
    const resFail = getBestConversion([d.f32, d.Void]);
    expect(resFail).toBeUndefined();
  });

  it('handles void as target type gracefully', () => {
    const resFail = getBestConversion([d.f32], [d.Void]);
    expect(resFail).toBeUndefined();
  });

  // TODO(#2519): This would require multiple passes of the conversion algorithm - maybe something to consider in the future
  // it('handles types needing deref and cast', () => {
  //   const res = getBestConversion([ptrI32, f32]);
  //   expect(res?.targetType).toBe(f32);
  //   expect(res?.actions).toEqual([
  //     { sourceIndex: 0, action: 'cast', targetType: f32 }, // Implicit deref + cast
  //     { sourceIndex: 1, action: 'none' },
  //   ]);
  //   expect(res?.hasImplicitConversions).toBe(true);
  // });
});
