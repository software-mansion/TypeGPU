import { describe, expect, expectTypeOf, it } from 'vitest';
import tgpu, { d } from '../../../src/index.js';
import {
  mat2x2f,
  mat3x3f,
  mat4x4f,
  vec2f,
  vec2h,
  vec2i,
  vec2u,
  vec3f,
  vec3h,
  vec3i,
  vec3u,
  vec4f,
  vec4h,
  vec4i,
  vec4u,
} from '../../../src/data/index.ts';
import type { m2x2f, m3x3f, m4x4f, v2f, v3f, v4f } from '../../../src/data/wgslTypes.ts';
import { mul } from '../../../src/std/index.ts';

describe('mul', () => {
  it('computes product of a number and a number', () => {
    expect(mul(17, 23)).toEqual(17 * 23);
  });

  it('computes product of a number and vec2f', () => {
    expect(mul(17, vec2f(0, 0))).toStrictEqual(vec2f(0, 0));
    expect(mul(0.4, vec2f(0.6, 0)).x).toBeCloseTo(0.24);
    expect(mul(0, vec2f(1, 0))).toStrictEqual(vec2f());
  });

  it('computes product of a number and vec2u', () => {
    expect(mul(2, vec2u(0, 0))).toStrictEqual(vec2u(0, 0));
    expect(mul(3, vec2u(1, 1))).toStrictEqual(vec2u(3));
  });

  it('computes product of a number and vec2i', () => {
    expect(mul(9, vec2i(0, 0))).toStrictEqual(vec2i(0, 0));
    expect(mul(-3, vec2i(1, 1))).toStrictEqual(vec2i(-3));
    expect(mul(0, vec2i(1, 1))).toStrictEqual(vec2i());
  });

  it('computes product of a number and vec3f', () => {
    expect(mul(2, vec3f(-1.5, -2, -3))).toStrictEqual(vec3f(-3, -4, -6));
    expect(mul(-2, vec3f(1))).toStrictEqual(vec3f(-2));
    expect(mul(0, vec3f(2, 3, 4))).toStrictEqual(vec3f());
  });

  it('computes product of a number and vec3u', () => {
    expect(mul(2, vec3u(1, 1, 1))).toStrictEqual(vec3u(2));
    expect(mul(0, vec3u(1))).toStrictEqual(vec3u());
  });

  it('computes product of a number and vec3i', () => {
    expect(mul(1, vec3i(-1, -2, -3))).toStrictEqual(vec3i(-1, -2, -3));
    expect(mul(-2, vec3i(2, 3, 4))).toStrictEqual(vec3i(-4, -6, -8));
    expect(mul(0, vec3i(2))).toStrictEqual(vec3i());
  });

  it('computes product of a number and vec4f', () => {
    expect(mul(0, vec4f(1.5, 2, 3, 4))).toStrictEqual(vec4f());
    expect(mul(2, vec4f(2, 3.5, 4, 5))).toStrictEqual(vec4f(4, 7, 8, 10));
    expect(mul(0.3, vec4f(0.3))).toStrictEqual(vec4f(0.09));
  });

  it('computes product of a number and vec4u', () => {
    expect(mul(2, vec4u(1, 1, 1, 1))).toStrictEqual(vec4u(2));
    expect(mul(8, vec4u(2))).toStrictEqual(vec4u(16));
  });

  it('computes product of a number and vec4i', () => {
    expect(mul(-1, vec4i(-1, -2, -3, -4))).toStrictEqual(vec4i(1, 2, 3, 4));
    expect(mul(0, vec4i(1))).toStrictEqual(vec4i());
    expect(mul(8, vec4i(2))).toStrictEqual(vec4i(16));
  });

  it('computes product of a vec2 and vec2', () => {
    expect(mul(vec2f(1, 2), vec2f(3, 4))).toEqual(vec2f(3, 8));
    expect(mul(vec2h(3, 4), vec2h(5, 6))).toEqual(vec2h(15, 24));
    expect(mul(vec2i(5, 6), vec2i(7, 8))).toEqual(vec2i(35, 48));
    expect(mul(vec2u(7, 8), vec2u(9, 10))).toEqual(vec2u(63, 80));
  });

  it('computes product of a vec3 and vec3', () => {
    expect(mul(vec3f(1, 2, 3), vec3f(3, 4, 5))).toEqual(vec3f(3, 8, 15));
    expect(mul(vec3h(3, 4, 5), vec3h(5, 6, 7))).toEqual(vec3h(15, 24, 35));
    expect(mul(vec3i(5, 6, 7), vec3i(7, 8, 9))).toEqual(vec3i(35, 48, 63));
    expect(mul(vec3u(7, 8, 9), vec3u(9, 10, 11))).toEqual(vec3u(63, 80, 99));
  });

  it('computes product of a vec4 and vec4', () => {
    expect(mul(vec4f(1, 2, 3, 4), vec4f(3, 4, 5, 6))).toEqual(vec4f(3, 8, 15, 24));
    expect(mul(vec4h(3, 4, 5, 6), vec4h(5, 6, 7, 8))).toEqual(vec4h(15, 24, 35, 48));
    expect(mul(vec4i(5, 6, 7, 8), vec4i(7, 8, 9, 10))).toEqual(vec4i(35, 48, 63, 80));
    expect(mul(vec4u(7, 8, 9, 10), vec4u(9, 10, 11, 12))).toEqual(vec4u(63, 80, 99, 120));
  });

  it('computes product of a number and mat2x2f', () => {
    expect(mul(-8, mat2x2f(1, -2, 3, -4))).toEqual(mat2x2f(-8, 16, -24, 32));
    expect(mul(0, mat2x2f())).toEqual(mat2x2f());
  });

  it('computes product of a number and mat3x3f', () => {
    expect(mul(-8, mat3x3f(1, -2, 3, -4, 5, -6, 7, -8, 9))).toEqual(
      mat3x3f(-8, 16, -24, 32, -40, 48, -56, 64, -72),
    );
    expect(mul(0, mat3x3f())).toEqual(mat3x3f());
  });

  it('computes product of a number and mat4x4f', () => {
    expect(mul(-8, mat4x4f(1, -2, 3, -4, 5, -6, 7, -8, 9, -10, 11, -12, 13, -14, 15, -16))).toEqual(
      mat4x4f(-8, 16, -24, 32, -40, 48, -56, 64, -72, 80, -88, 96, -104, 112, -120, 128),
    );
    expect(mul(0, mat4x4f())).toEqual(mat4x4f());
  });

  it('computes product of vec2f and a number', () => {
    expect(mul(vec2f(0, 0), 17)).toEqual(vec2f(0, 0));
    expect(mul(vec2f(0.6, 0), 0.4).x).toBeCloseTo(0.24);
    expect(mul(vec2f(1, 0), 0)).toEqual(vec2f());
  });

  it('computes product of vec3u and a number', () => {
    expect(mul(vec3u(1, 1, 1), 2)).toEqual(vec3u(2));
    expect(mul(vec3u(1), 0)).toEqual(vec3u());
  });

  it('computes product of vec4i and a number', () => {
    expect(mul(vec4i(-1, -2, -3, -4), -1)).toEqual(vec4i(1, 2, 3, 4));
    expect(mul(vec4i(1), 0)).toEqual(vec4i());
    expect(mul(vec4i(2), 8)).toEqual(vec4i(16));
  });

  it('computes product of mat2x2f and a number', () => {
    expect(mul(mat2x2f(1, -2, 3, -4), -8)).toEqual(mat2x2f(-8, 16, -24, 32));
    expect(mul(mat2x2f(), 0)).toEqual(mat2x2f());
  });

  it('computes product of mat3x3f and a number', () => {
    expect(mul(mat3x3f(1, -2, 3, -4, 5, -6, 7, -8, 9), -8)).toEqual(
      mat3x3f(-8, 16, -24, 32, -40, 48, -56, 64, -72),
    );
    expect(mul(mat3x3f(), 0)).toEqual(mat3x3f());
  });

  it('computes product of mat4x4f and a number', () => {
    expect(mul(mat4x4f(1, -2, 3, -4, 5, -6, 7, -8, 9, -10, 11, -12, 13, -14, 15, -16), -8)).toEqual(
      mat4x4f(-8, 16, -24, 32, -40, 48, -56, 64, -72, 80, -88, 96, -104, 112, -120, 128),
    );
    expect(mul(mat4x4f(), 0)).toEqual(mat4x4f());
  });

  it('computes product of a mat2x2 and mat2x2', () => {
    const a = mat2x2f(1, 2, 3, 4);
    const b = mat2x2f(5, 6, 7, 8);
    const expected = mat2x2f(23, 34, 31, 46);
    expect(mul(a, b)).toStrictEqual(expected);
  });

  it('computes product of a mat3x3 and mat3x3', () => {
    const a = mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const b = mat3x3f(10, 11, 12, 13, 14, 15, 16, 17, 18);
    const expected = mat3x3f(138, 171, 204, 174, 216, 258, 210, 261, 312);
    expect(mul(a, b)).toStrictEqual(expected);
  });

  it('computes product of a mat4x4 and mat4x4', () => {
    const a = mat4x4f(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    const b = mat4x4f(17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32);
    const expected = mat4x4f(
      538,
      612,
      686,
      760,
      650,
      740,
      830,
      920,
      762,
      868,
      974,
      1080,
      874,
      996,
      1118,
      1240,
    );
    expect(mul(a, b)).toStrictEqual(expected);
  });

  it('computes product of a mat2x2 and vec2f', () => {
    const m = mat2x2f(1, 2, 3, 4);
    const v = vec2f(5, 6);
    const expected = vec2f(23, 34);
    expect(mul(m, v)).toStrictEqual(expected);
  });

  it('computes product of a vec2f and mat2x2', () => {
    const v = vec2f(5, 6);
    const m = mat2x2f(1, 2, 3, 4);
    const expected = vec2f(17, 39);
    expect(mul(v, m)).toStrictEqual(expected);
  });

  it('computes product of a mat3x3 and vec3f', () => {
    const m = mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const v = vec3f(10, 11, 12);
    const expected = vec3f(138, 171, 204);
    expect(mul(m, v)).toStrictEqual(expected);
  });

  it('computes product of a vec3f and mat3x3', () => {
    const v = vec3f(10, 11, 12);
    const m = mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const expected = vec3f(68, 167, 266);
    expect(mul(v, m)).toStrictEqual(expected);
  });

  it('computes product of a mat4x4 and vec4f', () => {
    const m = mat4x4f(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    const v = vec4f(17, 18, 19, 20);
    const expected = vec4f(538, 612, 686, 760);
    expect(mul(m, v)).toStrictEqual(expected);
  });

  it('computes product of a vec4f and mat4x4', () => {
    const v = vec4f(17, 18, 19, 20);
    const m = mat4x4f(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    const expected = vec4f(190, 486, 782, 1078);
    expect(mul(v, m)).toStrictEqual(expected);
  });
});

describe('mul (codegen)', () => {
  it('coerces scalar to fit vector', () => {
    const foo = () => {
      'use gpu';
      const a = d.u32(2);
      return d.vec2f(2, 3).mul(a);
    };

    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
      "fn foo() -> vec2f {
        const a = 2u;
        return (vec2f(2, 3) * f32(a));
      }"
    `);
  });
});

describe('mul overload', () => {
  it('has correct return type', () => {
    expectTypeOf(mul(5, 1)).toEqualTypeOf<number>();
    expectTypeOf(mul(5, vec3f())).toEqualTypeOf<v3f>();
    expectTypeOf(mul(5, mat2x2f())).toEqualTypeOf<m2x2f>();
    expectTypeOf(mul(vec2f(), 1)).toEqualTypeOf<v2f>();
    expectTypeOf(mul(vec4f(), vec4f())).toEqualTypeOf<v4f>();
    expectTypeOf(mul(vec3f(), mat3x3f())).toEqualTypeOf<v3f>();
    expectTypeOf(mul(mat4x4f(), 5)).toEqualTypeOf<m4x4f>();
    expectTypeOf(mul(mat2x2f(), vec2f())).toEqualTypeOf<v2f>();
    expectTypeOf(mul(mat4x4f(), mat4x4f())).toEqualTypeOf<m4x4f>();
  });

  it('accepts union', () => {
    // expect no errors
    mul(1 as number | v2f | m3x3f, vec3f() as v3f | m2x2f);
    mul(vec3f() as v3f | v4f, 1 as number | v3f | m3x3f | v4f | m4x4f);
  });

  it('rejects when incompatible types', () => {
    // @ts-expect-error
    () => mul(vec2f(), vec2u());
    // @ts-expect-error
    () => mul(vec2f(), vec3f());
    // @ts-expect-error
    () => mul(mat3x3f(), mat4x4f());
    // @ts-expect-error
    () => mul(vec2f(), mat3x3f());
    // @ts-expect-error
    () => mul(mat3x3f(), vec2f());
  });
});
