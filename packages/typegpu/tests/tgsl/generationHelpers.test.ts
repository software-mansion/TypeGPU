import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { arrayOf } from '../../src/data/array.ts';
import { mat2x2f, mat3x3f, mat4x4f } from '../../src/data/matrix.ts';
import {
  abstractFloat,
  abstractInt,
  bool,
  f16,
  f32,
  i32,
  u32,
} from '../../src/data/numeric.ts';
import { ptrPrivate } from '../../src/data/ptr.ts';
import * as d from '../../src/data/index.ts';
import {
  vec2f,
  vec2i,
  vec3f,
  vec3i,
  vec4f,
  vec4h,
} from '../../src/data/vector.ts';
import {
  coerceToSnippet,
  convertStructValues,
  convertToCommonType,
  convertType,
  findBestOverload,
  type GenerationCtx,
  getBestConversion,
  getTypeForIndexAccess,
  getTypeForPropAccess,
  numericLiteralToSnippet,
  OverloadShape,
} from '../../src/tgsl/generationHelpers.ts';
import { UnknownData } from '../../src/data/dataTypes.ts';
import { snip, type Snippet } from '../../src/data/snippet.ts';
import { Void } from '../../src/data/index.ts';
import { CodegenState } from '../../src/types.ts';
import { INTERNAL_setCtx } from '../../src/execMode.ts';

const mockCtx = {
  indent: () => '',
  dedent: () => '',
  pushBlockScope: () => {},
  popBlockScope: () => {},
  mode: new CodegenState(),
  getById: vi.fn(),
  defineVariable: vi.fn((id, dataType) => ({ value: id, dataType })),
  resolve: vi.fn((val) => {
    if (
      (typeof val === 'function' || typeof val === 'object') &&
      'type' in val
    ) {
      return val.type;
    }
    return val;
  }),
  unwrap: vi.fn((val) => val),
  pre: '',
} as unknown as GenerationCtx;

describe('generationHelpers', () => {
  beforeEach(() => {
    INTERNAL_setCtx(mockCtx);
  });

  afterEach(() => {
    INTERNAL_setCtx(undefined);
  });

  describe('numericLiteralToSnippet', () => {
    it('should convert numeric literals to correct snippets', () => {
      expect(numericLiteralToSnippet(1)).toEqual(
        snip(1, abstractInt),
      );

      expect(numericLiteralToSnippet(1.1)).toEqual(
        snip(1.1, abstractFloat),
      );

      expect(numericLiteralToSnippet(1e10)).toEqual(
        snip(1e10, abstractFloat),
      );

      expect(numericLiteralToSnippet(0.5)).toEqual(
        snip(0.5, abstractFloat),
      );

      expect(numericLiteralToSnippet(-45)).toEqual(
        snip(-45, abstractInt),
      );

      expect(numericLiteralToSnippet(0x1A)).toEqual(
        snip(0x1A, abstractInt),
      );

      expect(numericLiteralToSnippet(0b101)).toEqual(snip(5, abstractInt));
    });
  });

  describe('getTypeForPropAccess', () => {
    const MyStruct = d.struct({
      foo: f32,
      bar: vec3f,
    });

    it('should return struct property types', () => {
      expect(getTypeForPropAccess(MyStruct, 'foo')).toBe(d.f32);
      expect(getTypeForPropAccess(MyStruct, 'bar')).toBe(d.vec3f);
      expect(getTypeForPropAccess(MyStruct, 'notfound')).toBe(UnknownData);
    });

    it('should return swizzle types on vectors', () => {
      expect(getTypeForPropAccess(d.vec4f, 'x')).toBe(d.f32);
      expect(getTypeForPropAccess(d.vec4f, 'yz')).toBe(d.vec2f);
      expect(getTypeForPropAccess(d.vec4f, 'xyzw')).toBe(d.vec4f);
    });

    it('should return UnknownData when applied to primitives or invalid', () => {
      expect(getTypeForPropAccess(d.u32, 'x')).toBe(UnknownData);
      expect(getTypeForPropAccess(d.bool, 'x')).toBe(UnknownData);
    });
  });

  describe('getTypeForIndexAccess', () => {
    it('returns element type for arrays', () => {
      const arr = d.arrayOf(d.f32, 2);
      expect(getTypeForIndexAccess(arr)).toBe(d.f32);
    });

    it('returns vector component', () => {
      expect(getTypeForIndexAccess(d.vec2i)).toBe(d.i32);
      expect(getTypeForIndexAccess(d.vec4h)).toBe(d.f16);
    });

    it('returns matrix column type', () => {
      expect(getTypeForIndexAccess(d.mat2x2f)).toBe(d.vec2f);
      expect(getTypeForIndexAccess(d.mat3x3f)).toBe(d.vec3f);
      expect(getTypeForIndexAccess(d.mat4x4f)).toBe(d.vec4f);
    });

    it('returns UnknownData otherwise', () => {
      expect(getTypeForIndexAccess(d.f32)).toBe(UnknownData);
    });
  });

  describe('getBestConversion', () => {
    const ptrF32 = ptrPrivate(d.f32);
    const ptrI32 = ptrPrivate(d.i32);

    it('returns result for identical types', () => {
      const res = getBestConversion([d.f32, d.f32]);
      expect(res?.targetType).toBe(d.f32);
      expect(res?.actions).toStrictEqual([
        { type: 'none' },
        { type: 'none' },
      ]);
      expect(res?.hasImplicitConversions).toBeFalsy();
    });

    it('handles abstract types automatically', () => {
      const resFloat = getBestConversion([abstractFloat, d.f32]);
      expect(resFloat?.targetType).toBe(d.f32);
      expect(resFloat?.actions).toStrictEqual([
        { type: 'none' },
        { type: 'none' },
      ]);
      expect(resFloat?.hasImplicitConversions).toBeFalsy();

      const resInt = getBestConversion([abstractInt, d.i32]);
      expect(resInt?.targetType).toBe(d.i32);
      expect(resInt?.actions).toStrictEqual([
        { type: 'none' },
        { type: 'none' },
      ]);
      expect(resInt?.hasImplicitConversions).toBeFalsy();

      const resMixed = getBestConversion([abstractInt, d.f32]);
      expect(resMixed?.targetType).toBe(d.f32); // abstractInt -> f32 (rank 6)
      expect(resMixed?.actions).toStrictEqual([
        { type: 'none' },
        { type: 'none' },
      ]);
      expect(resMixed?.hasImplicitConversions).toBeFalsy();

      const resMixed2 = getBestConversion([abstractInt, abstractFloat, d.f16]);
      expect(resMixed2?.targetType).toBe(d.f16); // abstractInt -> f16 (rank 7), abstractFloat -> f16 (rank 2)
      expect(resMixed2?.actions).toStrictEqual([
        { type: 'none' },
        { type: 'none' },
        { type: 'none' },
      ]);
      expect(resMixed2?.hasImplicitConversions).toBeFalsy();
    });

    it('handles implicit casts', () => {
      const res = getBestConversion([d.i32, d.f32]);
      expect(res?.targetType).toBe(d.f32);
      expect(res?.actions).toStrictEqual([
        { type: 'cast', toType: d.f32 },
        { type: 'none' },
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
      expect(res2Result?.actions).toStrictEqual([
        // Order corresponds to input [u32, f16, i32]
        { type: 'cast', toType: d.f16 }, // u32 -> f16
        { type: 'none' }, // f16 -> f16
        { type: 'cast', toType: d.f16 }, // i32 -> f16
      ]);
      expect(res2Result?.hasImplicitConversions).toBe(true);
    });

    it('handles pointer dereferencing', () => {
      const res = getBestConversion([ptrF32, d.f32]);
      expect(res?.targetType).toBe(d.f32);
      expect(res?.actions).toStrictEqual([{ type: 'deref' }, { type: 'none' }]);
      expect(res?.hasImplicitConversions).toBeFalsy();

      const res2 = getBestConversion([ptrF32, d.i32, d.f32]); // Target f32: deref, cast, none
      expect(res2?.targetType).toBe(d.f32);
      expect(res2?.actions).toStrictEqual([
        { type: 'deref' },
        { type: 'cast', toType: d.f32 }, // Implicitly derefs then casts
        { type: 'none' },
      ]);
      expect(res2?.hasImplicitConversions).toBe(true); // Because of the cast
    });

    it('returns undefined for incompatible types', () => {
      expect(getBestConversion([d.f32, d.vec2f])).toBeUndefined();
      expect(getBestConversion([d.struct({ a: d.f32 }), d.f32]))
        .toBeUndefined();
    });

    it('respects targetTypes restriction', () => {
      // abstractInt -> i32 (rank 3), u32 (rank 4), f32 (rank 6), f16 (rank 7)
      // i32 -> i32 (rank 0)
      // Common types without restriction: i32
      // Restrict to f32:
      const res = getBestConversion([abstractInt, d.i32], [d.f32]);
      expect(res?.targetType).toBe(d.f32);
      expect(res?.actions).toStrictEqual([
        { type: 'none' }, // abstractInt -> f32 is auto
        { type: 'cast', toType: d.f32 }, // i32 -> f32 is cast
      ]);
      expect(res?.hasImplicitConversions).toBe(true);

      // Restrict to incompatible type
      const resFail = getBestConversion([abstractInt, d.i32], [d.vec2f]);
      expect(resFail).toBeUndefined();

      // Restrict to a type requiring implicit conversion for all
      const resImplicit = getBestConversion([d.i32, d.u32], [d.f32]);
      expect(resImplicit?.targetType).toBe(d.f32);
      expect(resImplicit?.actions).toStrictEqual([
        { type: 'cast', toType: d.f32 },
        { type: 'cast', toType: d.f32 },
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

  describe('convertType', () => {
    const ptrF32 = d.ptrPrivate(d.f32);

    it('allows identical types (none)', () => {
      const res = convertType(d.f32, d.f32);
      expect(res?.targetType).toBe(d.f32);
      expect(res?.actions).toStrictEqual([{ type: 'none' }]);
      expect(res?.hasImplicitConversions).toBeFalsy();
    });

    it('allows abstract types (none)', () => {
      const res = convertType(abstractFloat, d.f32);
      expect(res?.targetType).toBe(d.f32);
      expect(res?.actions).toStrictEqual([{ type: 'none' }]);
      expect(res?.hasImplicitConversions).toBeFalsy();

      const res2 = convertType(abstractInt, d.f16);
      expect(res2?.targetType).toBe(d.f16);
      expect(res2?.actions).toStrictEqual([{ type: 'none' }]);
      expect(res2?.hasImplicitConversions).toBeFalsy();
    });

    it('allows implicit casts (cast)', () => {
      const res = convertType(d.i32, d.f32);
      expect(res?.targetType).toBe(d.f32);
      expect(res?.actions).toStrictEqual([
        { type: 'cast', toType: d.f32 },
      ]);
      expect(res?.hasImplicitConversions).toBe(true);
    });

    it('disallows implicit casts when specified', () => {
      const res = convertType(d.i32, d.f32, false);
      expect(res).toBeUndefined();
    });

    it('allows pointer dereferencing (deref)', () => {
      const res = convertType(ptrF32, d.f32);
      expect(res?.targetType).toBe(d.f32);
      expect(res?.actions).toStrictEqual([{ type: 'deref' }]);
      expect(res?.hasImplicitConversions).toBeFalsy();
    });

    it('allows pointer referencing (ref)', () => {
      const res = convertType(f32, ptrF32);
      expect(res?.targetType).toBe(ptrF32); // Target type should be the pointer type
      expect(res?.actions).toStrictEqual([{ type: 'ref' }]);
      expect(res?.hasImplicitConversions).toBeFalsy();
    });

    it('returns undefined for incompatible types', () => {
      expect(convertType(d.vec2f, d.f32)).toBeUndefined();
      expect(convertType(d.f32, d.vec2f)).toBeUndefined();
      expect(convertType(ptrF32, d.i32)).toBeUndefined(); // Deref ok, but f32 != i32 (needs cast)
    });
  });

  describe('convertToCommonType', () => {
    const snippetF32 = snip('2.22', d.f32);
    const snippetI32 = snip('-12', d.i32);
    const snippetU32 = snip('33', d.u32);
    const snippetAbsFloat = snip('1.1', abstractFloat);
    const snippetAbsInt = snip('1', abstractInt);
    const snippetPtrF32 = snip('ptr_f32', d.ptrPrivate(d.f32));
    const snippetUnknown = snip('?', UnknownData);

    it('converts identical types', () => {
      const result = convertToCommonType({
        ctx: mockCtx,
        values: [snippetF32, snippetF32],
      });
      expect(result).toBeDefined();
      expect(result?.length).toBe(2);
      expect(result?.[0]?.dataType).toBe(d.f32);
      expect(result?.[0]?.value).toBe('2.22');
      expect(result?.[1]?.dataType).toBe(d.f32);
      expect(result?.[1]?.value).toBe('2.22');
    });

    it('handles abstract types automatically', () => {
      const result = convertToCommonType({
        ctx: mockCtx,
        values: [
          snippetAbsFloat,
          snippetF32,
          snippetAbsInt,
        ],
      });
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
      const result = convertToCommonType({
        ctx: mockCtx,
        values: [snippetI32, snippetF32],
      });
      expect(result).toBeDefined();
      expect(result?.length).toBe(2);
      expect(result?.[0]?.dataType).toBe(d.f32);
      expect(result?.[0]?.value).toBe('f32(-12)'); // Cast applied
      expect(result?.[1]?.dataType).toBe(d.f32);
      expect(result?.[1]?.value).toBe('2.22');
    });

    it('performs pointer dereferencing', () => {
      const result = convertToCommonType({
        ctx: mockCtx,
        values: [snippetPtrF32, snippetF32],
      });
      expect(result).toBeDefined();
      expect(result?.length).toBe(2);
      expect(result?.[0]?.dataType).toBe(d.f32);
      expect(result?.[0]?.value).toBe('*ptr_f32'); // Deref applied
      expect(result?.[1]?.dataType).toBe(d.f32);
      expect(result?.[1]?.value).toBe('2.22');
    });

    it('returns undefined for incompatible types', () => {
      const snippetVec2f = snip('v2', d.vec2f);
      const result = convertToCommonType({
        ctx: mockCtx,
        values: [snippetF32, snippetVec2f],
      });
      expect(result).toBeUndefined();
    });

    it('returns undefined if any type is UnknownData', () => {
      const result = convertToCommonType({
        ctx: mockCtx,
        values: [snippetF32, snippetUnknown],
      });
      expect(result).toBeUndefined();
    });

    it('returns undefined for empty input', () => {
      const result = convertToCommonType({ ctx: mockCtx, values: [] });
      expect(result).toBeUndefined();
    });

    it('respects restrictTo types', () => {
      // [abstractInt, i32] -> common type i32
      // Restrict to f32: requires cast for i32
      const result = convertToCommonType({
        ctx: mockCtx,
        values: [snippetAbsInt, snippetI32],
        restrictTo: [d.f32],
      });
      expect(result).toBeDefined();
      expect(result?.length).toBe(2);
      expect(result?.[0]?.dataType).toBe(d.f32);
      expect(result?.[0]?.value).toBe('1');
      expect(result?.[1]?.dataType).toBe(d.f32);
      expect(result?.[1]?.value).toBe('f32(-12)'); // Cast applied
    });

    it('fails if restrictTo is incompatible', () => {
      const result = convertToCommonType({
        ctx: mockCtx,
        values: [snippetAbsInt, snippetI32],
        restrictTo: [d.vec2f],
      });
      expect(result).toBeUndefined();
    });

    it('handles void gracefully', () => {
      const result = convertToCommonType({
        ctx: mockCtx,
        values: [snippetF32, snip('void', Void)],
      });
      expect(result).toBeUndefined();
    });

    it('handles void as target type gracefully', () => {
      const result = convertToCommonType({
        ctx: mockCtx,
        values: [snippetF32],
        restrictTo: [d.Void],
      });
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
        a: snip('1.0', d.f32),
        b: snip('2', d.i32),
        c: snip('vec2f(1.0, 1.0)', d.vec2f),
        d: snip('true', d.bool),
      };
      const res = convertStructValues(mockCtx, structType, snippets);
      expect(res.length).toBe(4);
      expect(res[0]).toStrictEqual(snippets.a);
      expect(res[1]).toStrictEqual(snippets.b);
      expect(res[2]).toStrictEqual(snippets.c);
      expect(res[3]).toStrictEqual(snippets.d);
    });

    it('maps values requiring implicit casts and warns', () => {
      const snippets: Record<string, Snippet> = {
        a: snip('1', d.i32), // i32 -> f32 (cast)
        b: snip('2', d.u32), // u32 -> i32 (cast)
        c: snip('2.22', d.f32),
        d: snip('true', d.bool),
      };
      const res = convertStructValues(mockCtx, structType, snippets);
      expect(res.length).toBe(4);
      expect(res[0]).toEqual(snip('f32(1)', d.f32)); // Cast applied
      expect(res[1]).toEqual(snip('i32(2)', i32)); // Cast applied
      expect(res[2]).toEqual(snippets.c);
      expect(res[3]).toEqual(snippets.d);
    });

    it('throws on missing property', () => {
      const snippets: Record<string, Snippet> = {
        a: snip('1.0', f32),
        // b is missing
        c: snip('vec2f(1.0, 1.0)', vec2f),
        d: snip('true', bool),
      };
      expect(() => convertStructValues(mockCtx, structType, snippets)).toThrow(
        /Missing property b/,
      );
    });
  });

  describe('coerceToSnippet', () => {
    it('coerces JS numbers', () => {
      expect(coerceToSnippet(1)).toEqual(snip(1, abstractInt));
      expect(coerceToSnippet(2.5)).toEqual(snip(2.5, abstractFloat));
      expect(coerceToSnippet(-10)).toEqual(snip(-10, abstractInt));
      expect(coerceToSnippet(0.0)).toEqual(snip(0, abstractInt));
    });

    it('coerces JS booleans', () => {
      expect(coerceToSnippet(true)).toEqual(snip(true, bool));
      expect(coerceToSnippet(false)).toEqual(snip(false, bool));
    });

    it(`coerces schemas to UnknownData (as they're not instance types)`, () => {
      expect(coerceToSnippet(f32)).toEqual(snip(f32, UnknownData));
      expect(coerceToSnippet(vec3i)).toEqual(snip(vec3i, UnknownData));
      const arr = arrayOf(f32, 2);
      expect(coerceToSnippet(arr)).toEqual(snip(arr, UnknownData));
    });

    it('coerces arrays to unknown', () => {
      const resInt = coerceToSnippet([1, 2, 3]);
      expect(resInt.dataType.type).toBe('unknown');

      const resFloat = coerceToSnippet([1.0, 2.5, -0.5]);
      expect(resFloat.dataType.type).toBe('unknown');
    });

    it('returns UnknownData for arrays of incompatible types', () => {
      const res = coerceToSnippet([1, true, 'hello']);
      expect(res.dataType).toBe(UnknownData);
      expect(res.value).toEqual([1, true, 'hello']); // Original array value
    });

    it('returns UnknownData for empty arrays', () => {
      const res = coerceToSnippet([]);
      expect(res.dataType).toBe(UnknownData);
      expect(res.value).toEqual([]);
    });

    it('returns UnknownData for other types', () => {
      expect(coerceToSnippet('foo')).toEqual(snip('foo', UnknownData));
      expect(coerceToSnippet({})).toEqual(snip({}, UnknownData));
      expect(coerceToSnippet(null)).toEqual(snip(null, UnknownData));
      expect(coerceToSnippet(undefined)).toEqual(snip(undefined, UnknownData));
      const fn = () => {};
      expect(coerceToSnippet(fn)).toEqual(snip(fn, UnknownData));
    });
  });

  describe('findBestOverload', () => {
    it('chooses obvious candidate', () => {
      const overloads: OverloadShape[] = [
        { argTypes: [d.f32, d.f32], returnType: d.f32 },
        { argTypes: [d.u32, d.u32], returnType: d.u32 },
      ];

      expect(findBestOverload([snip(1, d.f32), snip(2, d.f32)], overloads))
        .toBe(overloads[0]);

      expect(findBestOverload([snip(1, d.u32), snip(2, d.u32)], overloads))
        .toBe(overloads[1]);

      // Mismatched number of arguments
      expect(findBestOverload(
        [snip(1, d.u32), snip(2, d.u32), snip(3, d.u32)],
        overloads,
      )).toBe(undefined);
    });
  });
});
