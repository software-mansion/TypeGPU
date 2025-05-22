import { describe, expect, it } from 'vitest';
import * as d from '../../../src/data/index.ts';
import { div, isCloseTo } from '../../../src/std/index.ts';

describe('div', () => {
  it('divides numbers just like js would', () => {
    expect(div(4, 2)).toBeCloseTo(2);
    expect(div(3, 2)).toBeCloseTo(1.5);
    expect(div(d.u32(3), d.u32(2))).toBeCloseTo(1.5);
  });

  it('computes quotient of vecNf and a number', () => {
    expect(isCloseTo(div(d.vec2f(1, 2), 2), d.vec2f(0.5, 1))).toBe(true);
    expect(isCloseTo(div(d.vec3f(1, 2, 3), 3), d.vec3f(0.333, 0.666, 1))).toBe(
      true,
    );
    expect(isCloseTo(div(d.vec4f(1, 2, 3, 4), 4), d.vec4f(0.25, 0.5, 0.75, 1)))
      .toBe(true);
  });

  it('computes quotient of vecNi and a number', () => {
    expect(div(d.vec2i(1, 2), 1)).toStrictEqual(d.vec2i(1, 2));
    expect(div(d.vec3i(1, 2, 3), 2)).toStrictEqual(d.vec3i(0, 1, 1));
    expect(div(d.vec4i(5, 6, 7, 8), 3)).toStrictEqual(d.vec4i(1, 2, 2, 2));
  });

  it('computes quotient of a number and vecNf', () => {
    expect(isCloseTo(div(2, d.vec2f(1, 2)), d.vec2f(0.5, 1))).toBe(true);
    expect(isCloseTo(div(3, d.vec3f(1, 2, 3)), d.vec3f(0.333, 0.666, 1))).toBe(
      true,
    );
    expect(isCloseTo(div(4, d.vec4f(1, 2, 3, 4)), d.vec4f(0.25, 0.5, 0.75, 1)))
      .toBe(true);
  });

  it('computes quotient of a number and vecNi', () => {
    expect(div(1, d.vec2i(1, 2))).toStrictEqual(d.vec2i(1, 2));
    expect(div(2, d.vec3i(1, 2, 3))).toStrictEqual(d.vec3i(0, 1, 1));
    expect(div(3, d.vec4i(5, 6, 7, 8))).toStrictEqual(d.vec4i(1, 2, 2, 2));
  });

  it('computes quotient of vecNh and vecNh', () => {
    expect(isCloseTo(div(d.vec2h(1, 2), d.vec2h(4)), d.vec2h(0.25, 0.5))).toBe(
      true,
    );
    expect(
      isCloseTo(div(d.vec3h(1, 2, 3), d.vec3h(3)), d.vec3h(0.333, 0.666, 1)),
    ).toBe(true);
    expect(
      isCloseTo(
        div(d.vec4h(1.5, 2, 3, 4), d.vec4h(2)),
        d.vec4h(0.75, 1, 1.5, 2),
      ),
    ).toBe(true);
  });

  it('computes quotient of vecNu and vecNu', () => {
    expect(div(d.vec2u(1, 2), d.vec2u(2))).toStrictEqual(d.vec2u(0, 1));
    expect(div(d.vec3u(5, 6, 7), d.vec3u(3))).toStrictEqual(d.vec3u(1, 2, 2));
    expect(div(d.vec4u(1, 2, 8, 9), d.vec4u(4))).toStrictEqual(
      d.vec4u(0, 0, 2, 2),
    );
  });

  it('handles division by 0', () => {
    expect(div(d.vec2u(1, 2), d.vec2u(0))).toStrictEqual(d.vec2u(1, 2));
    expect(div(d.vec4u(1, 2, 8, 9), 0)).toStrictEqual(d.vec4u(1, 2, 8, 9));
  });
});
