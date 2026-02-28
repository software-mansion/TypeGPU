import { describe, expect, expectTypeOf, it } from 'vitest';
import type { m3x3f, v2f, v3f, v4f } from '../../../src/data/index.ts';
import {
  mat2x2f,
  mat3x3f,
  mat4x4f,
  vec2f,
  vec2i,
  vec2u,
  vec3f,
  vec3i,
  vec3u,
  vec4f,
  vec4i,
  vec4u,
} from '../../../src/data/index.ts';
import { add } from '../../../src/std/index.ts';
import { expectDataTypeOf } from '../../utils/parseResolved.ts';
import { abstractFloat, abstractInt } from '../../../src/data/numeric.ts';

describe('add', () => {
  it('computes sum of two vec2f', () => {
    expect(add(vec2f(0, 0), vec2f(0, 0))).toStrictEqual(vec2f(0, 0));
    expect(add(vec2f(1.2, 0.1), vec2f(1.0, 0.5))).toStrictEqual(vec2f(2.2, 0.6));
    expect(add(vec2f(-1.5, 1), vec2f(1, 0.1))).toStrictEqual(vec2f(-0.5, 1.1));
  });

  it('computes sum of two vec2u', () => {
    expect(add(vec2u(0, 0), vec2u(0, 0))).toStrictEqual(vec2u(0, 0));
    expect(add(vec2u(1, 0), vec2u(1, 2))).toStrictEqual(vec2u(2, 2));
  });

  it('computes sum of two vec2i', () => {
    expect(add(vec2i(0, 0), vec2i(0, 0))).toStrictEqual(vec2i(0, 0));
    expect(add(vec2i(1, 0), vec2i(1, 0))).toStrictEqual(vec2i(2, 0));
    expect(add(vec2i(-1, 1), vec2i(1, 0))).toStrictEqual(vec2i(0, 1));
  });

  it('computes sum of two vec3f', () => {
    expect(add(vec3f(1.5, 2, 3), vec3f(-1.5, -2, -3))).toStrictEqual(vec3f(0, 0, 0));
    expect(add(vec3f(1, 1, 1), vec3f(2, 3, 4))).toStrictEqual(vec3f(3, 4, 5));
    expect(add(vec3f(1.5), vec3f(2))).toStrictEqual(vec3f(3.5));
  });

  it('computes sum of two vec3u', () => {
    expect(add(vec3u(1, 1, 1), vec3u(2, 3, 4))).toStrictEqual(vec3u(3, 4, 5));
    expect(add(vec3u(1), vec3u(2))).toStrictEqual(vec3u(3));
  });

  it('computes sum of two vec3i', () => {
    expect(add(vec3i(1, 2, 3), vec3i(-1, -2, -3))).toStrictEqual(vec3i(0, 0, 0));
    expect(add(vec3i(1, 1, 1), vec3i(2, 3, 4))).toStrictEqual(vec3i(3, 4, 5));
    expect(add(vec3i(1), vec3i(2))).toStrictEqual(vec3i(3));
  });

  it('computes sum of two vec4f', () => {
    expect(add(vec4f(1.5, 2, 3, 4), vec4f(-1.5, -2, -3, -4))).toStrictEqual(vec4f(0, 0, 0, 0));
    expect(add(vec4f(1, 1, 1, 1), vec4f(2, 3.5, 4, 5))).toStrictEqual(vec4f(3, 4.5, 5, 6));
    expect(add(vec4f(1), vec4f(2.5))).toStrictEqual(vec4f(3.5));
  });

  it('computes sum of two vec4u', () => {
    expect(add(vec4u(1, 1, 1, 1), vec4u(2, 3, 4, 5))).toStrictEqual(vec4u(3, 4, 5, 6));
    expect(add(vec4u(1), vec4u(2))).toStrictEqual(vec4u(3));
  });

  it('computes sum of two vec4i', () => {
    expect(add(vec4i(1, 2, 3, 4), vec4i(-1, -2, -3, -4))).toStrictEqual(vec4i(0, 0, 0, 0));
    expect(add(vec4i(1, 1, 1, 1), vec4i(2, 3, 4, 5))).toStrictEqual(vec4i(3, 4, 5, 6));
    expect(add(vec4i(1), vec4i(2))).toStrictEqual(vec4i(3));
  });

  it('computes sum of two numbers', () => {
    expect(add(12, 37)).toEqual(49);
    expect(add(-12, 37)).toEqual(25);
  });

  it('computes sum of a vector and a number', () => {
    expect(add(vec2u(2, 1), 1)).toEqual(vec2u(3, 2));
    expect(add(vec3f(), 2)).toEqual(vec3f(2));
    expect(add(vec4i(1, 2, 3, 4), -3)).toEqual(vec4i(-2, -1, 0, 1));
  });

  it('computes sum of a number and a vector', () => {
    expect(add(1, vec2u(1, 2))).toEqual(vec2u(2, 3));
    expect(add(3, vec3f())).toEqual(vec3f(3));
    expect(add(-1, vec4i(1, 2, 3, 4))).toEqual(vec4i(0, 1, 2, 3));
  });

  it('computes sum of two matrices', () => {
    expect(add(mat3x3f(), mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9))).toEqual(
      mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9),
    );
    expect(add(mat2x2f(1, 2, 3, 4), mat2x2f(5, 6, 7, 8))).toEqual(mat2x2f(6, 8, 10, 12));
    expect(
      add(
        mat4x4f(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16),
        mat4x4f(-1, 2, -3, 4, -5, 6, -7, 8, -9, 10, -11, 12, -13, 14, -15, 16),
      ),
    ).toEqual(mat4x4f(0, 4, 0, 8, 0, 12, 0, 16, 0, 20, 0, 24, 0, 28, 0, 32));
  });

  describe('in tgsl', () => {
    it('infers types when adding constants', () => {
      const int_int = () => {
        'use gpu';
        1 + 2;
      };

      const float_float = () => {
        'use gpu';
        1.1 + 2.3;
      };

      const int_float = () => {
        'use gpu';
        1.1 + 2;
      };

      const float_int = () => {
        'use gpu';
        1 + 2.3;
      };

      expectDataTypeOf(int_int).toBe(abstractInt);
      expectDataTypeOf(float_float).toBe(abstractFloat);
      expectDataTypeOf(int_float).toBe(abstractFloat);
      expectDataTypeOf(float_int).toBe(abstractFloat);
    });
  });
});

describe('add overload', () => {
  it('has correct return type', () => {
    expectTypeOf(add(5, 1)).toEqualTypeOf<number>();
    expectTypeOf(add(5, vec3f())).toEqualTypeOf<v3f>();
    expectTypeOf(add(vec2f(), 1)).toEqualTypeOf<v2f>();
    expectTypeOf(add(vec4f(), vec4f())).toEqualTypeOf<v4f>();
    expectTypeOf(add(mat3x3f(), mat3x3f())).toEqualTypeOf<m3x3f>();
  });

  it('accepts union', () => {
    // expect no errors
    add(1, vec3f() as number | v3f);
    add(vec2f(), vec2f() as number | v2f);
  });

  it('rejects when incompatible types', () => {
    // @ts-expect-error
    () => add(vec2f(), vec2u());
    // @ts-expect-error
    () => add(vec2f(), vec3f());
    // @ts-expect-error
    () => add(mat3x3f(), mat4x4f());
    // @ts-expect-error
    () => add(vec2f(), mat3x3f());
    // @ts-expect-error
    () => add(mat3x3f(), vec2f());
    // @ts-expect-error
    () => add(1, mat2x2f());
    // @ts-expect-error
    () => add(mat3x3f(), 1);
  });
});
