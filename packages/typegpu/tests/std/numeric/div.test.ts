import { describe, expect, expectTypeOf, it } from 'vitest';
import { div, isCloseTo } from '../../../src/std/index.ts';
import {
  m3x3f,
  m4x4f,
  mat2x2f,
  mat4x4f,
  u32,
  v2f,
  v3f,
  v3u,
  v4f,
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

describe('div', () => {
  it('divides numbers just like js would', () => {
    expect(div(4, 2)).toBeCloseTo(2);
    expect(div(3, 2)).toBeCloseTo(1.5);
    expect(div(u32(3), u32(2))).toBeCloseTo(1.5);
  });

  it('computes quotient of vecNf and a number', () => {
    expect(isCloseTo(div(vec2f(1, 2), 2), vec2f(0.5, 1))).toBe(true);
    expect(isCloseTo(div(vec3f(1, 2, 3), 3), vec3f(0.333, 0.666, 1))).toBe(
      true,
    );
    expect(isCloseTo(div(vec4f(1, 2, 3, 4), 4), vec4f(0.25, 0.5, 0.75, 1)))
      .toBe(true);
  });

  it('computes quotient of vecNi and a number', () => {
    expect(div(vec2i(1, 2), 1)).toStrictEqual(vec2i(1, 2));
    expect(div(vec3i(1, 2, 3), 2)).toStrictEqual(vec3i(0, 1, 1));
    expect(div(vec4i(5, 6, 7, 8), 3)).toStrictEqual(vec4i(1, 2, 2, 2));
  });

  it('computes quotient of a number and vecNf', () => {
    expect(isCloseTo(div(2, vec2f(1, 2)), vec2f(0.5, 1))).toBe(true);
    expect(isCloseTo(div(3, vec3f(1, 2, 3)), vec3f(0.333, 0.666, 1))).toBe(
      true,
    );
    expect(isCloseTo(div(4, vec4f(1, 2, 3, 4)), vec4f(0.25, 0.5, 0.75, 1)))
      .toBe(true);
  });

  it('computes quotient of a number and vecNi', () => {
    expect(div(1, vec2i(1, 2))).toStrictEqual(vec2i(1, 2));
    expect(div(2, vec3i(1, 2, 3))).toStrictEqual(vec3i(0, 1, 1));
    expect(div(3, vec4i(5, 6, 7, 8))).toStrictEqual(vec4i(1, 2, 2, 2));
  });

  it('computes quotient of vecNh and vecNh', () => {
    expect(isCloseTo(div(vec2h(1, 2), vec2h(4)), vec2h(0.25, 0.5))).toBe(
      true,
    );
    expect(
      isCloseTo(div(vec3h(1, 2, 3), vec3h(3)), vec3h(0.333, 0.666, 1)),
    ).toBe(true);
    expect(
      isCloseTo(
        div(vec4h(1.5, 2, 3, 4), vec4h(2)),
        vec4h(0.75, 1, 1.5, 2),
      ),
    ).toBe(true);
  });

  it('computes quotient of vecNu and vecNu', () => {
    expect(div(vec2u(1, 2), vec2u(2))).toStrictEqual(vec2u(0, 1));
    expect(div(vec3u(5, 6, 7), vec3u(3))).toStrictEqual(vec3u(1, 2, 2));
    expect(div(vec4u(1, 2, 8, 9), vec4u(4))).toStrictEqual(
      vec4u(0, 0, 2, 2),
    );
  });

  it('handles division by 0', () => {
    expect(div(vec2u(1, 2), vec2u(0))).toStrictEqual(vec2u(1, 2));
    expect(div(vec4u(1, 2, 8, 9), 0)).toStrictEqual(vec4u(1, 2, 8, 9));
  });
});

describe('div overload', () => {
  it('has correct return type', () => {
    expectTypeOf(div(5, 1)).toEqualTypeOf<number>();
    expectTypeOf(div(5, vec3f())).toEqualTypeOf<v3f>();
    expectTypeOf(div(vec2f(), 1)).toEqualTypeOf<v2f>();
    expectTypeOf(div(vec4f(), vec4f())).toEqualTypeOf<v4f>();
    expectTypeOf(div(vec3u(), vec3u())).toEqualTypeOf<v3u>();
  });

  it('accepts union', () => {
    // expect no errors
    div(1 as number | v2f, vec2f() as v2f);
    div(vec3f() as v3f | v4f, 1 as number | v3f | v4f);
  });

  it('rejects when incompatible types', () => {
    // @ts-expect-error
    (() => div(vec2f(), vec2u()));
    // @ts-expect-error
    (() => div(vec2f(), vec3f()));
    // @ts-expect-error
    (() => div(mat3x3f(), mat3x3f()));
  });
});
