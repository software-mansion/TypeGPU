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

import { sub } from '../../../src/std/index.ts';

describe('sub', () => {
  it('computes difference of two vec2f', () => {
    expect(sub(vec2f(0, 0), vec2f(0, 0))).toStrictEqual(vec2f(0, 0));
    expect(sub(vec2f(1.2, 0), vec2f(1.0, 0)).x).toBeCloseTo(0.2);
    expect(sub(vec2f(-1.5, 1), vec2f(1, 0))).toStrictEqual(vec2f(-2.5, 1));
  });

  it('computes difference of two vec2u', () => {
    expect(sub(vec2u(0, 0), vec2u(0, 0))).toStrictEqual(vec2u(0, 0));
    expect(sub(vec2u(1, 2), vec2u(1, 0))).toStrictEqual(vec2u(0, 2));
  });

  it('computes difference of two vec2i', () => {
    expect(sub(vec2i(0, 0), vec2i(0, 0))).toStrictEqual(vec2i(0, 0));
    expect(sub(vec2i(1, 0), vec2i(1, 0))).toStrictEqual(vec2i(0));
    expect(sub(vec2i(-1, 1), vec2i(1, 0))).toStrictEqual(vec2i(-2, 1));
  });

  it('computes difference of two vec3f', () => {
    expect(sub(vec3f(1.5, 2, 3), vec3f(-1.5, -2, -3))).toStrictEqual(vec3f(3, 4, 6));
    expect(sub(vec3f(1, 1, 1), vec3f(1))).toStrictEqual(vec3f());
    expect(sub(vec3f(1.5), vec3f(2))).toStrictEqual(vec3f(-0.5));
  });

  it('computes difference of two vec3u', () => {
    expect(sub(vec3u(2, 3, 4), vec3u(1, 1, 1))).toStrictEqual(vec3u(1, 2, 3));
    expect(sub(vec3u(2), vec3u(1))).toStrictEqual(vec3u(1));
  });

  it('computes difference of two vec3i', () => {
    expect(sub(vec3i(1, 2, 3), vec3i(-1, -2, -3))).toStrictEqual(vec3i(2, 4, 6));
    expect(sub(vec3i(1, 1, 1), vec3i(2, 3, 4))).toStrictEqual(vec3i(-1, -2, -3));
    expect(sub(vec3i(1), vec3i(2))).toStrictEqual(vec3i(-1));
  });

  it('computes difference of two vec4f', () => {
    expect(sub(vec4f(1.5, 2, 3, 4), vec4f(1.5, 2, 3, 4))).toStrictEqual(vec4f());
    expect(sub(vec4f(1, 1, 1, 1), vec4f(2, 3.5, 4, 5))).toStrictEqual(vec4f(-1, -2.5, -3, -4));
    expect(sub(vec4f(1), vec4f(2.5))).toStrictEqual(vec4f(-1.5));
  });

  it('computes difference of two vec4u', () => {
    expect(sub(vec4u(2, 3, 4, 5), vec4u(1, 1, 1, 1))).toStrictEqual(vec4u(1, 2, 3, 4));
    expect(sub(vec4u(1), vec4u(1))).toStrictEqual(vec4u());
  });

  it('computes difference of two vec4i', () => {
    expect(sub(vec4i(1, 2, 3, 4), vec4i(-1, -2, -3, -4))).toStrictEqual(vec4i(2, 4, 6, 8));
    expect(sub(vec4i(1, 1, 1, 1), vec4i(1))).toStrictEqual(vec4i());
    expect(sub(vec4i(1), vec4i(2))).toStrictEqual(vec4i(-1));
  });

  it('computes difference of two numbers', () => {
    expect(sub(12, 37)).toEqual(-25);
    expect(sub(-12, 37)).toEqual(-49);
  });

  it('computes difference of a vector and a number', () => {
    expect(sub(vec2u(2, 1), 1)).toEqual(vec2u(1, 0));
    expect(sub(vec3f(), 2)).toEqual(vec3f(-2));
    expect(sub(vec4i(1, 2, 3, 4), -3)).toEqual(vec4i(4, 5, 6, 7));
  });

  it('computes difference of a number and a vector', () => {
    expect(sub(1, vec2u(1, 2))).toEqual(vec2u(0, -1));
    expect(sub(3, vec3f())).toEqual(vec3f(3));
    expect(sub(-1, vec4i(1, 2, 3, 4))).toEqual(vec4i(-2, -3, -4, -5));
  });

  it('computes difference of two matrices', () => {
    expect(sub(mat3x3f(), mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9))).toEqual(
      mat3x3f(-1, -2, -3, -4, -5, -6, -7, -8, -9),
    );
    expect(sub(mat2x2f(1, 2, 3, 4), mat2x2f(8, 7, 6, 5))).toEqual(mat2x2f(-7, -5, -3, -1));
    expect(
      sub(
        mat4x4f(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16),
        mat4x4f(-1, 2, -3, 4, -5, 6, -7, 8, -9, 10, -11, 12, -13, 14, -15, 16),
      ),
    ).toEqual(mat4x4f(2, 0, 6, 0, 10, 0, 14, 0, 18, 0, 22, 0, 26, 0, 30, 0));
  });
});

describe('sub overload', () => {
  it('has correct return type', () => {
    expectTypeOf(sub(5, 1)).toEqualTypeOf<number>();
    expectTypeOf(sub(5, vec3f())).toEqualTypeOf<v3f>();
    expectTypeOf(sub(vec2f(), 1)).toEqualTypeOf<v2f>();
    expectTypeOf(sub(vec4f(), vec4f())).toEqualTypeOf<v4f>();
    expectTypeOf(sub(mat3x3f(), mat3x3f())).toEqualTypeOf<m3x3f>();
  });

  it('accepts union', () => {
    // expect no errors
    sub(1, vec3f() as number | v3f);
    sub(vec2f(), vec2f() as number | v2f);
  });

  it('rejects when incompatible types', () => {
    // @ts-expect-error
    () => sub(vec2f(), vec2u());
    // @ts-expect-error
    () => sub(vec2f(), vec3f());
    // @ts-expect-error
    () => sub(mat3x3f(), mat4x4f());
    // @ts-expect-error
    () => sub(vec2f(), mat3x3f());
    // @ts-expect-error
    () => sub(mat3x3f(), vec2f());
    // @ts-expect-error
    () => sub(1, mat2x2f());
    // @ts-expect-error
    () => sub(mat3x3f(), 1);
  });
});
