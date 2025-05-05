import { describe, expect, it } from 'vitest';
import * as d from '../../../src/data/index.ts';
import { div } from '../../../src/std/index.ts';

describe('div', () => {
  it('computes quotient of a d.vec2f and a number', () => {
    expect(div(d.vec2f(0, 0), 17)).toStrictEqual(d.vec2f(0, 0));
    expect(div(d.vec2f(0.24, 0), 0.4).x).toBeCloseTo(0.6);
    expect(div(d.vec2f(0, 0), 5)).toStrictEqual(d.vec2f());
  });

  it('computes quotient of a d.vec2u and a number', () => {
    expect(div(d.vec2u(0, 0), 2)).toStrictEqual(d.vec2u(0, 0));
    expect(div(d.vec2u(3, 3), 3)).toStrictEqual(d.vec2u(1));
  });

  it('computes quotient of a d.vec2i and a number', () => {
    expect(div(d.vec2i(0, 0), 9)).toStrictEqual(d.vec2i(0, 0));
    expect(div(d.vec2i(-3, -3), -3)).toStrictEqual(d.vec2i(1));
    expect(div(d.vec2i(0, 0), 5)).toStrictEqual(d.vec2i());
  });

  it('computes quotient of a d.vec3f and a number', () => {
    expect(div(d.vec3f(-3, -4, -6), 2)).toStrictEqual(d.vec3f(-1.5, -2, -3));
    expect(div(d.vec3f(-2, -2, -2), -2)).toStrictEqual(d.vec3f(1));
    expect(div(d.vec3f(0, 0, 0), 5)).toStrictEqual(d.vec3f());
  });

  it('computes quotient of a d.vec3u and a number', () => {
    expect(div(d.vec3u(2, 2, 2), 2)).toStrictEqual(d.vec3u(1));
    expect(div(d.vec3u(0, 0, 0), 5)).toStrictEqual(d.vec3u());
  });

  it('computes quotient of a d.vec3i and a number', () => {
    expect(div(d.vec3i(-1, -2, -3), 1)).toStrictEqual(d.vec3i(-1, -2, -3));
    expect(div(d.vec3i(-4, -6, -8), -2)).toStrictEqual(d.vec3i(2, 3, 4));
    expect(div(d.vec3i(2, 2, 2), 2)).toStrictEqual(d.vec3i(1));
  });

  it('computes quotient of a d.vec4f and a number', () => {
    expect(div(d.vec4f(1.5, 2, 3, 4), 2)).toStrictEqual(
      d.vec4f(0.75, 1, 1.5, 2),
    );
    expect(div(d.vec4f(4, 7, 8, 10), 2)).toStrictEqual(d.vec4f(2, 3.5, 4, 5));
    expect(div(d.vec4f(0.09, 0.09, 0.09, 0.09), 0.3)).toStrictEqual(
      d.vec4f(0.3),
    );
  });

  it('computes quotient of a d.vec4u and a number', () => {
    expect(div(d.vec4u(2, 2, 2, 2), 2)).toStrictEqual(d.vec4u(1));
    expect(div(d.vec4u(16, 16, 16, 16), 8)).toStrictEqual(d.vec4u(2));
  });

  it('computes quotient of a d.vec4i and a number', () => {
    expect(div(d.vec4i(1, 2, 3, 4), -1)).toStrictEqual(d.vec4i(-1, -2, -3, -4));
    expect(div(d.vec4i(0, 0, 0, 0), 1)).toStrictEqual(d.vec4i());
    expect(div(d.vec4i(16, 16, 16, 16), 8)).toStrictEqual(d.vec4i(2));
  });

  it('computes quotient of a d.vec4f and a d.vec4f', () => {
    expect(div(d.vec4f(1.5, 2, 3, 4), d.vec4f(2, 2, 2, 2))).toStrictEqual(
      d.vec4f(0.75, 1, 1.5, 2),
    );
    expect(div(d.vec4f(0.09, 0.09, 0.09, 0.09), d.vec4f(0.3))).toStrictEqual(
      d.vec4f(0.3),
    );
  });

  it('computes quotient of a d.vec4u and a d.vec4u', () => {
    expect(div(d.vec4u(2, 2, 2, 2), d.vec4u(2))).toStrictEqual(d.vec4u(1));
    expect(div(d.vec4u(16, 16, 16, 16), d.vec4u(8))).toStrictEqual(d.vec4u(2));
  });

  it('computes quotient of a d.vec4i and a d.vec4i', () => {
    expect(div(d.vec4i(1, 2, 3, 4), d.vec4i(-1))).toStrictEqual(
      d.vec4i(-1, -2, -3, -4),
    );
    expect(div(d.vec4i(0, 0, 0, 0), d.vec4i(1))).toStrictEqual(d.vec4i());
    expect(div(d.vec4i(16, 16, 16, 16), d.vec4i(8))).toStrictEqual(d.vec4i(2));
  });
});
