import { describe, expect, it } from 'vitest';
import {
  mat2x2f,
  vec2f,
  vec2h,
  vec2i,
  vec2u,
} from '../../../src/data/index.ts';

describe('dot operators', () => {
  it('computes product of a vec2 and number', () => {
    expect(vec2f(1, 2).mul(2)).toStrictEqual(vec2f(2, 4));
    expect(vec2h(3, 4).mul(3)).toStrictEqual(vec2h(9, 12));
    expect(vec2i(5, 6).mul(4)).toStrictEqual(vec2i(20, 24));
    expect(vec2u(7, 8).mul(5)).toStrictEqual(vec2u(35, 40));
  });

  // it('computes product of a vec3 and number', () => {
  //   expect(vec3f(1, 2, 3).mul(2)).toStrictEqual(vec3f(2, 4, 6));
  //   expect(vec3h(3, 4, 5).mul(3)).toStrictEqual(vec3h(9, 12, 15));
  //   expect(vec3i(5, 6, 7).mul(4)).toStrictEqual(vec3i(20, 24, 28));
  //   expect(vec3u(7, 8, 9).mul(5)).toStrictEqual(vec3u(35, 40, 45));
  // });

  // it('computes product of a vec4 and number', () => {
  //   expect(vec4f(1, 2, 3, 4).mul(2)).toStrictEqual(vec4f(2, 4, 6, 8));
  //   expect(vec4h(3, 4, 5, 6).mul(3)).toStrictEqual(vec4h(9, 12, 15, 20));
  //   expect(vec4i(5, 6, 7, 8).mul(4)).toStrictEqual(vec4i(20, 24, 28, 32));
  //   expect(vec4u(7, 8, 9, 10).mul(5)).toStrictEqual(vec4u(35, 40, 45, 50));
  // });

  it('computes product of a vec2 and vec2', () => {
    expect(vec2f(1, 2).mul(vec2f(3, 4))).toStrictEqual(vec2f(3, 8));
    expect(vec2h(3, 4).mul(vec2h(5, 6))).toStrictEqual(vec2h(15, 24));
    expect(vec2i(5, 6).mul(vec2i(7, 8))).toStrictEqual(vec2i(35, 48));
    expect(vec2u(7, 8).mul(vec2u(9, 10))).toStrictEqual(vec2u(63, 80));
  });

  // it('computes product of a vec3 and vec3', () => {
  //   expect(vec3f(1, 2, 3).mul(vec3f(3, 4, 5))).toStrictEqual(vec3f(3, 8, 15));
  //   expect(vec3h(3, 4, 5).mul(vec3h(5, 6, 7))).toStrictEqual(vec3h(15, 24, 35));
  //   expect(vec3i(5, 6, 7).mul(vec3i(7, 8, 9))).toStrictEqual(vec3i(35, 48, 63));
  //   expect(vec3u(7, 8, 9).mul(vec3u(9, 10, 11))).toStrictEqual(
  //     vec3u(63, 80, 99),
  //   );
  // });

  // it('computes product of a vec4 and vec4', () => {
  //   expect(vec4f(1, 2, 3, 4).mul(vec4f(3, 4, 5, 6))).toStrictEqual(
  //     vec4f(3, 8, 15, 24),
  //   );
  //   expect(vec4h(3, 4, 5, 6).mul(vec4h(5, 6, 7, 8))).toStrictEqual(
  //     vec4h(15, 24, 35, 48),
  //   );
  //   expect(vec4i(5, 6, 7, 8).mul(vec4i(7, 8, 9, 10))).toStrictEqual(
  //     vec4i(35, 48, 63, 80),
  //   );
  //   expect(vec4u(7, 8, 9, 10).mul(vec4u(9, 10, 11, 12))).toStrictEqual(
  //     vec4u(63, 80, 99, 120),
  //   );
  // });

  it('computes product of a vec2f and mat2x2', () => {
    const v = vec2f(5, 6);
    const m = mat2x2f(1, 2, 3, 4);
    const expected = vec2f(17, 39);
    expect(v.mul(m)).toEqual(expected);
  });

  // it('computes product of a vec3f and mat3x3', () => {
  //   const v = vec3f(10, 11, 12);
  //   const m = mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9);
  //   const expected = vec3f(68, 167, 266);
  //   expect(v.mul(m)).toEqual(expected);
  // });

  // it('computes product of a vec4f and mat4x4', () => {
  //   const v = vec4f(17, 18, 19, 20);
  //   const m = mat4x4f(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
  //   const expected = vec4f(190, 486, 782, 1078);
  //   expect(v.mul(m)).toEqual(expected);
  // });
});
