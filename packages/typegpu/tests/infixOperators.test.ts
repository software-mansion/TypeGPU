import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import { isCloseTo } from '../src/std/boolean.ts';

describe('infix operators', () => {
  it('correctly applies mul to vectors', () => {
    // vector * scalar
    expect(isCloseTo(d.vec2f(1, 2).mul(2), d.vec2f(2, 4))).toBe(true);

    // vector * vector
    expect(d.vec3i(1, 2, 3).mul(d.vec3i(-1, -2, -3))).toStrictEqual(
      d.vec3i(-1, -4, -9),
    );

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
    const m = d.mat2x2f(1, 2, 3, 4);
    console.log(m);
    console.log(Object.getPrototypeOf(m));
    console.log(Object.getPrototypeOf(Object.getPrototypeOf(m)));

    expect(
      d.mat2x2f(1, 2, 3, 4).mul(2),
    ).toStrictEqual(
      d.mat2x2f(2, 4, 6, 8),
    );

    // // Matrix * vector
    // expect(
    //   d.mat2x2f(1, 2, 3, 4).mul(d.vec2f(5, 6)),
    // ).toStrictEqual(
    //   d.vec2f(1 * 5 + 3 * 6, 2 * 5 + 4 * 6),
    // );

    // // Matrix * matrix
    // expect(
    //   d.mat2x2f(1, 2, 3, 4).mul(d.mat2x2f(7, 8, 9, 10)),
    // ).toStrictEqual(
    //   d.mat2x2f(
    //     1 * 7 + 3 * 8,
    //     2 * 7 + 4 * 8,
    //     1 * 9 + 3 * 10,
    //     2 * 9 + 4 * 10,
    //   ),
    // );
  });
});
