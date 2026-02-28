import { afterAll, beforeAll, describe, expect } from 'vitest';
import { abstractFloat, abstractInt } from '../../src/data/numeric.ts';
import * as d from '../../src/data/index.ts';
import { snip, type Snippet } from '../../src/data/snippet.ts';
import {
  convertStructValues,
  convertToCommonType,
  getBestConversion,
} from '../../src/tgsl/conversion.ts';
import { it } from '../utils/extendedIt.ts';
import { INTERNAL_setCtx } from '../../src/execMode.ts';
import { CodegenState } from '../../src/types.ts';
import { UnknownData } from '../../src/data/dataTypes.ts';
import { ResolutionCtxImpl } from '../../src/resolutionCtx.ts';
import { namespace } from '../../src/core/resolve/namespace.ts';
import wgslGenerator from '../../src/tgsl/wgslGenerator.ts';
import { INTERNAL_createPtr } from '../../src/data/ptr.ts';

const ctx = new ResolutionCtxImpl({
  namespace: namespace({ names: 'strict' }),
  shaderGenerator: wgslGenerator,
});
ctx.pushMode(new CodegenState());

beforeAll(() => {
  INTERNAL_setCtx(ctx);
});

afterAll(() => {
  INTERNAL_setCtx(undefined);
});

describe('getBestConversion', () => {
  // d.ptrPrivate(d.f32)
  const ptrF32 = INTERNAL_createPtr('private', d.f32, 'read-write', /* implicit */ true);
  // d.ptrPrivate(d.i32)
  const ptrI32 = INTERNAL_createPtr('private', d.i32, 'read-write', /* implicit */ true);

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

  // TODO: This would require multiple passes of the conversion algorithm - maybe something to consider in the future
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

describe('convertToCommonType', () => {
  const snippetF32 = snip('2.22', d.f32, /* origin */ 'runtime');
  const snippetI32 = snip('-12', d.i32, /* origin */ 'runtime');
  const snippetU32 = snip('33', d.u32, /* origin */ 'runtime');
  const snippetAbsFloat = snip('1.1', abstractFloat, /* origin */ 'runtime');
  const snippetAbsInt = snip('1', abstractInt, /* origin */ 'runtime');
  const snippetPtrF32 = snip(
    'ptr_f32',
    INTERNAL_createPtr('private', d.f32, 'read-write', /* implicit */ true),
    /* origin */ 'function',
  );
  const snippetUnknown = snip('?', UnknownData, /* origin */ 'runtime');

  it('converts identical types', () => {
    const result = convertToCommonType(ctx, [snippetF32, snippetF32]);
    expect(result).toBeDefined();
    expect(result?.length).toBe(2);
    expect(result?.[0]?.dataType).toBe(d.f32);
    expect(result?.[0]?.value).toBe('2.22');
    expect(result?.[1]?.dataType).toBe(d.f32);
    expect(result?.[1]?.value).toBe('2.22');
  });

  it('handles abstract types automatically', () => {
    const result = convertToCommonType(ctx, [snippetAbsFloat, snippetF32, snippetAbsInt]);
    // since WGSL handles all abstract types automatically, this should be basically identity
    expect(result).toBeDefined();
    expect(result?.length).toBe(3);
    expect(result?.[0]?.dataType).toBe(d.f32);
    expect(result?.[0]?.value).toBe('1.1');
    expect(result?.[1]?.dataType).toBe(d.f32);
    expect(result?.[1]?.value).toBe('2.22');
    expect(result?.[2]?.dataType).toBe(d.f32);
    expect(result?.[2]?.value).toBe('1');
  });

  it('performs implicit casts and warns', () => {
    const result = convertToCommonType(ctx, [snippetI32, snippetF32]);
    expect(result).toBeDefined();
    expect(result?.length).toBe(2);
    expect(result?.[0]?.dataType).toBe(d.f32);
    expect(result?.[0]?.value).toBe('f32(-12)'); // Cast applied
    expect(result?.[1]?.dataType).toBe(d.f32);
    expect(result?.[1]?.value).toBe('2.22');
  });

  it('performs pointer dereferencing', () => {
    const result = convertToCommonType(ctx, [snippetPtrF32, snippetF32]);
    expect(result).toBeDefined();
    expect(result?.length).toBe(2);
    expect(result?.[0]?.dataType).toBe(d.f32);
    expect(result?.[0]?.value).toBe('(*ptr_f32)'); // Deref applied
    expect(result?.[1]?.dataType).toBe(d.f32);
    expect(result?.[1]?.value).toBe('2.22');
  });

  it('returns undefined for incompatible types', () => {
    const snippetVec2f = snip('v2', d.vec2f, /* origin */ 'runtime');
    const result = convertToCommonType(ctx, [snippetF32, snippetVec2f]);
    expect(result).toBeUndefined();
  });

  it('returns undefined if any type is UnknownData', () => {
    const result = convertToCommonType(ctx, [snippetF32, snippetUnknown]);
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty input', () => {
    const result = convertToCommonType(ctx, []);
    expect(result).toBeUndefined();
  });

  it('respects restrictTo types', () => {
    // [abstractInt, i32] -> common type i32
    // Restrict to f32: requires cast for i32
    const result = convertToCommonType(ctx, [snippetAbsInt, snippetI32], [d.f32]);
    expect(result).toBeDefined();
    expect(result?.length).toBe(2);
    expect(result?.[0]?.dataType).toBe(d.f32);
    expect(result?.[0]?.value).toBe('1');
    expect(result?.[1]?.dataType).toBe(d.f32);
    expect(result?.[1]?.value).toBe('f32(-12)'); // Cast applied
  });

  it('can restrict abstractFloat to u32', () => {
    const result = convertToCommonType(ctx, [snippetAbsFloat], [d.u32]);
    expect(result).toBeDefined();
    expect(result?.[0]?.dataType).toBe(d.u32);
    expect(result?.[0]?.value).toBe('u32(1.1)');
  });

  it('fails if restrictTo is incompatible', () => {
    const result = convertToCommonType(ctx, [snippetAbsInt, snippetI32], [d.vec2f]);
    expect(result).toBeUndefined();
  });

  it('handles void gracefully', () => {
    const result = convertToCommonType(ctx, [
      snippetF32,
      snip('void', d.Void, /* origin */ 'runtime'),
    ]);
    expect(result).toBeUndefined();
  });

  it('handles void as target type gracefully', () => {
    const result = convertToCommonType(ctx, [snippetF32], [d.Void]);
    expect(result).toBeUndefined();
  });
});

describe('convertStructValues', () => {
  const structType = d.struct({
    a: d.f32,
    b: d.i32,
    c: d.vec2f,
    d: d.bool,
  });

  it('maps values matching types exactly', () => {
    const snippets: Record<string, Snippet> = {
      a: snip('1.0', d.f32, /* origin */ 'runtime'),
      b: snip('2', d.i32, /* origin */ 'runtime'),
      c: snip('vec2f(1.0, 1.0)', d.vec2f, /* origin */ 'runtime'),
      d: snip('true', d.bool, /* origin */ 'runtime'),
    };
    const res = convertStructValues(ctx, structType, snippets);
    expect(res.length).toBe(4);
    expect(res[0]).toEqual(snippets.a);
    expect(res[1]).toEqual(snippets.b);
    expect(res[2]).toEqual(snippets.c);
    expect(res[3]).toEqual(snippets.d);
  });

  it('maps values requiring implicit casts and warns', () => {
    const snippets: Record<string, Snippet> = {
      a: snip('1', d.i32, /* origin */ 'runtime'), // i32 -> f32 (cast)
      b: snip('2', d.u32, /* origin */ 'runtime'), // u32 -> i32 (cast)
      c: snip('2.22', d.f32, /* origin */ 'runtime'),
      d: snip('true', d.bool, /* origin */ 'runtime'),
    };
    const res = convertStructValues(ctx, structType, snippets);
    expect(res.length).toBe(4);
    expect(res[0]).toEqual(snip('f32(1)', d.f32, /* origin */ 'runtime')); // Cast applied
    expect(res[1]).toEqual(snip('i32(2)', d.i32, /* origin */ 'runtime')); // Cast applied
    expect(res[2]).toEqual(snippets.c);
    expect(res[3]).toEqual(snippets.d);
  });

  it('throws on missing property', () => {
    const snippets: Record<string, Snippet> = {
      a: snip('1.0', d.f32, /* origin */ 'runtime'),
      // b is missing
      c: snip('vec2f(1.0, 1.0)', d.vec2f, /* origin */ 'runtime'),
      d: snip('true', d.bool, /* origin */ 'runtime'),
    };
    expect(() => convertStructValues(ctx, structType, snippets)).toThrow(/Missing property b/);
  });
});
