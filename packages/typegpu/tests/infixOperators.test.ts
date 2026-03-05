import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import { isCloseTo } from '../src/std/boolean.ts';

describe('infix operators', () => {
  it('correctly applies add to vectors', () => {
    // vector + scalar
    expect(isCloseTo(d.vec2f(1, 2).add(2), d.vec2f(3, 4))).toBe(true);

    // vector + vector
    expect(d.vec3i(1, 2, 3).add(d.vec3i(-1, -2, -3))).toStrictEqual(d.vec3i());
  });

  it('correctly applies add to matrices', () => {
    // matrix + matrix
    expect(
      d.mat3x3f(10, 10, 10, 10, 10, 10, 10, 10, 10).add(d.mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9)),
    ).toStrictEqual(d.mat3x3f(11, 12, 13, 14, 15, 16, 17, 18, 19));
  });

  it('correctly applies sub to vectors', () => {
    // vector - scalar
    expect(isCloseTo(d.vec2f(1, 2).sub(2), d.vec2f(-1, 0))).toBe(true);

    // vector - vector
    expect(d.vec3i(1, 2, 3).sub(d.vec3i(-1, -2, -3))).toStrictEqual(d.vec3i(2, 4, 6));
  });

  it('correctly applies sub to matrices', () => {
    // matrix - matrix
    expect(
      d.mat3x3f(10, 10, 10, 10, 10, 10, 10, 10, 10).sub(d.mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9)),
    ).toStrictEqual(d.mat3x3f(9, 8, 7, 6, 5, 4, 3, 2, 1));
  });

  it('correctly applies mul to vectors', () => {
    // vector * scalar
    expect(isCloseTo(d.vec2f(1, 2).mul(2), d.vec2f(2, 4))).toBe(true);

    // vector * vector
    expect(d.vec3i(1, 2, 3).mul(d.vec3i(-1, -2, -3))).toStrictEqual(d.vec3i(-1, -4, -9));

    // vector * matrix
    expect(
      isCloseTo(
        d.vec4f(1, 2, 3, 4).mul(d.mat4x4f.scaling(d.vec3f(10, 20, 30))),
        d.vec4f(10, 40, 90, 4),
      ),
    ).toBe(true);
  });

  it('correctly applies mul to matrices', () => {
    // Matrix * scalar
    expect(d.mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9).mul(2)).toStrictEqual(
      d.mat3x3f(2, 4, 6, 8, 10, 12, 14, 16, 18),
    );

    // Matrix * vector
    expect(d.mat2x2f(1, 2, 3, 4).mul(d.vec2f(5, 6))).toStrictEqual(d.vec2f(23, 34));

    // Matrix * matrix
    expect(d.mat2x2f(1, 2, 3, 4).mul(d.mat2x2f(2, 0, 0, 3))).toStrictEqual(d.mat2x2f(2, 4, 9, 12));
  });

  it('correctly applies div to vectors', () => {
    // vector / scalar
    expect(isCloseTo(d.vec2f(1, 2).div(2), d.vec2f(0.5, 1))).toBe(true);

    // vector / vector
    expect(d.vec3i(-1, -4, -9).div(d.vec3i(-1, -2, -3))).toStrictEqual(d.vec3i(1, 2, 3));
  });
});
