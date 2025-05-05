import { describe, expect, it } from 'vitest';
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
import { mul } from '../../../src/std/index.ts';

describe('mul', () => {
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
    const b = mat4x4f(
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      28,
      29,
      30,
      31,
      32,
    );
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
