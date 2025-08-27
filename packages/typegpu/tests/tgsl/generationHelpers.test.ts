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
import { struct } from '../../src/data/struct.ts';
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
  type GenerationCtx,
  getTypeForIndexAccess,
  getTypeForPropAccess,
  numericLiteralToSnippet,
} from '../../src/tgsl/generationHelpers.ts';
import { UnknownData } from '../../src/data/dataTypes.ts';
import { snip } from '../../src/data/snippet.ts';
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
        snip(1e10, abstractInt),
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
    const MyStruct = struct({
      foo: f32,
      bar: vec3f,
    });

    it('should return struct property types', () => {
      expect(getTypeForPropAccess(MyStruct, 'foo')).toBe(f32);
      expect(getTypeForPropAccess(MyStruct, 'bar')).toBe(vec3f);
      expect(getTypeForPropAccess(MyStruct, 'notfound')).toBe(UnknownData);
    });

    it('should return swizzle types on vectors', () => {
      expect(getTypeForPropAccess(vec4f, 'x')).toBe(f32);
      expect(getTypeForPropAccess(vec4f, 'yz')).toBe(vec2f);
      expect(getTypeForPropAccess(vec4f, 'xyzw')).toBe(vec4f);
    });

    it('should return UnknownData when applied to primitives or invalid', () => {
      expect(getTypeForPropAccess(u32, 'x')).toBe(UnknownData);
      expect(getTypeForPropAccess(bool, 'x')).toBe(UnknownData);
    });
  });

  describe('getTypeForIndexAccess', () => {
    const arr = arrayOf(f32, 2);

    it('returns element type for arrays', () => {
      expect(getTypeForIndexAccess(arr)).toBe(f32);
    });

    it('returns vector component', () => {
      expect(getTypeForIndexAccess(vec2i)).toBe(i32);
      expect(getTypeForIndexAccess(vec4h)).toBe(f16);
    });

    it('returns matrix column type', () => {
      expect(getTypeForIndexAccess(mat2x2f)).toBe(vec2f);
      expect(getTypeForIndexAccess(mat3x3f)).toBe(vec3f);
      expect(getTypeForIndexAccess(mat4x4f)).toBe(vec4f);
    });

    it('returns UnknownData otherwise', () => {
      expect(getTypeForIndexAccess(f32)).toBe(UnknownData);
    });
  });

  describe('coerceToSnippet', () => {
    const arr = arrayOf(f32, 2);

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
});
