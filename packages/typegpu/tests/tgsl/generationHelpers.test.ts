import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  accessProp,
  coerceToSnippet,
  getTypeForIndexAccess,
  numericLiteralToSnippet,
} from '../../src/tgsl/generationHelpers.ts';
import { UnknownData } from '../../src/data/dataTypes.ts';
import { snip } from '../../src/data/snippet.ts';
import { INTERNAL_setCtx } from '../../src/execMode.ts';
import { ResolutionCtxImpl } from '../../src/resolutionCtx.ts';
import { namespace } from '../../src/core/resolve/namespace.ts';

describe('generationHelpers', () => {
  beforeEach(() => {
    const ctx = new ResolutionCtxImpl({
      namespace: namespace(),
    });
    INTERNAL_setCtx(ctx);
  });

  afterEach(() => {
    INTERNAL_setCtx(undefined);
  });

  describe('numericLiteralToSnippet', () => {
    it('should convert numeric literals to correct snippets', () => {
      expect(numericLiteralToSnippet(1)).toEqual(
        snip(1, abstractInt, /* ref */ undefined),
      );

      expect(numericLiteralToSnippet(1.1)).toEqual(
        snip(1.1, abstractFloat, /* ref */ undefined),
      );

      expect(numericLiteralToSnippet(1e10)).toEqual(
        snip(1e10, abstractInt, /* ref */ undefined),
      );

      expect(numericLiteralToSnippet(0.5)).toEqual(
        snip(0.5, abstractFloat, /* ref */ undefined),
      );

      expect(numericLiteralToSnippet(-45)).toEqual(
        snip(-45, abstractInt, /* ref */ undefined),
      );

      expect(numericLiteralToSnippet(0x1A)).toEqual(
        snip(0x1A, abstractInt, /* ref */ undefined),
      );

      expect(numericLiteralToSnippet(0b101)).toEqual(
        snip(5, abstractInt, /* ref */ undefined),
      );
    });
  });

  describe('accessProp', () => {
    const MyStruct = struct({
      foo: f32,
      bar: vec3f,
    });

    it('should return struct property types', () => {
      const target = snip('foo', MyStruct, 'this-function');
      expect(accessProp(target, 'foo')).toStrictEqual(
        snip('foo.foo', f32, /* ref */ undefined),
      );
      expect(accessProp(target, 'bar')).toStrictEqual(
        snip('foo.bar', vec3f, /* ref */ 'this-function'),
      );
      expect(accessProp(target, 'notfound')).toStrictEqual(undefined);
    });

    it('should return swizzle types on vectors', () => {
      const target = snip('foo', vec4f, 'this-function');

      expect(accessProp(target, 'x')).toStrictEqual(
        snip('foo.x', f32, /* ref */ undefined),
      );
      expect(accessProp(target, 'yz')).toStrictEqual(
        snip('foo.yz', vec2f, /* ref */ undefined),
      );
      expect(accessProp(target, 'xyzw')).toStrictEqual(
        snip('foo.xyzw', vec4f, /* ref */ undefined),
      );
    });

    it('should return UnknownData when applied to primitives or invalid', () => {
      const target1 = snip('foo', u32, /* ref */ undefined);
      const target2 = snip('foo', bool, /* ref */ undefined);
      expect(accessProp(target1, 'x')).toBe(undefined);
      expect(accessProp(target2, 'x')).toBe(undefined);
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
      expect(coerceToSnippet(1)).toEqual(
        snip(1, abstractInt, /* ref */ undefined),
      );
      expect(coerceToSnippet(2.5)).toEqual(
        snip(2.5, abstractFloat, /* ref */ undefined),
      );
      expect(coerceToSnippet(-10)).toEqual(
        snip(-10, abstractInt, /* ref */ undefined),
      );
      expect(coerceToSnippet(0.0)).toEqual(
        snip(0, abstractInt, /* ref */ undefined),
      );
    });

    it('coerces JS booleans', () => {
      expect(coerceToSnippet(true)).toEqual(
        snip(true, bool, /* ref */ undefined),
      );
      expect(coerceToSnippet(false)).toEqual(
        snip(false, bool, /* ref */ undefined),
      );
    });

    it(`coerces schemas to UnknownData (as they're not instance types)`, () => {
      expect(coerceToSnippet(f32)).toEqual(
        snip(f32, UnknownData, /* ref */ undefined),
      );
      expect(coerceToSnippet(vec3i)).toEqual(
        snip(vec3i, UnknownData, /* ref */ undefined),
      );
      expect(coerceToSnippet(arr)).toEqual(
        snip(arr, UnknownData, /* ref */ undefined),
      );
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
      expect(coerceToSnippet('foo')).toEqual(
        snip('foo', UnknownData, /* ref */ undefined),
      );
      expect(coerceToSnippet({})).toEqual(
        snip({}, UnknownData, /* ref */ undefined),
      );
      expect(coerceToSnippet(null)).toEqual(
        snip(null, UnknownData, /* ref */ undefined),
      );
      expect(coerceToSnippet(undefined)).toEqual(
        snip(undefined, UnknownData, /* ref */ undefined),
      );
      const fn = () => {};
      expect(coerceToSnippet(fn)).toEqual(
        snip(fn, UnknownData, /* ref */ undefined),
      );
    });
  });
});
