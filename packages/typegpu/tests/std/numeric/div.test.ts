import { describe, expect, it } from 'vitest';
import {
  vec2f,
  vec2i,
  vec2u,
  vec3f,
  vec3i,
  vec3u,
  vec4f,
  vec4i,
  vec4u,
} from '../../../src/data/vector.ts';
import { div } from '../../../src/std/numeric.ts';

describe('div', () => {
  it('computes quotient of a vec2f and a number', () => {
    expect(div(vec2f(0, 0), 17)).toEqual(vec2f(0, 0));
    expect(div(vec2f(0.24, 0), 0.4).x).toBeCloseTo(0.6);
    expect(div(vec2f(0, 0), 5)).toEqual(vec2f());
  });

  it('computes quotient of a vec2u and a number', () => {
    expect(div(vec2u(0, 0), 2)).toEqual(vec2u(0, 0));
    expect(div(vec2u(3, 3), 3)).toEqual(vec2u(1));
  });

  it('computes quotient of a vec2i and a number', () => {
    expect(div(vec2i(0, 0), 9)).toEqual(vec2i(0, 0));
    expect(div(vec2i(-3, -3), -3)).toEqual(vec2i(1));
    expect(div(vec2i(0, 0), 5)).toEqual(vec2i());
  });

  it('computes quotient of a vec3f and a number', () => {
    expect(div(vec3f(-3, -4, -6), 2)).toEqual(vec3f(-1.5, -2, -3));
    expect(div(vec3f(-2, -2, -2), -2)).toEqual(vec3f(1));
    expect(div(vec3f(0, 0, 0), 5)).toEqual(vec3f());
  });

  it('computes quotient of a vec3u and a number', () => {
    expect(div(vec3u(2, 2, 2), 2)).toEqual(vec3u(1));
    expect(div(vec3u(0, 0, 0), 5)).toEqual(vec3u());
  });

  it('computes quotient of a vec3i and a number', () => {
    expect(div(vec3i(-1, -2, -3), 1)).toEqual(vec3i(-1, -2, -3));
    expect(div(vec3i(-4, -6, -8), -2)).toEqual(vec3i(2, 3, 4));
    expect(div(vec3i(2, 2, 2), 2)).toEqual(vec3i(1));
  });

  it('computes quotient of a vec4f and a number', () => {
    expect(div(vec4f(1.5, 2, 3, 4), 2)).toEqual(vec4f(0.75, 1, 1.5, 2));
    expect(div(vec4f(4, 7, 8, 10), 2)).toEqual(vec4f(2, 3.5, 4, 5));
    expect(div(vec4f(0.09, 0.09, 0.09, 0.09), 0.3)).toEqual(vec4f(0.3));
  });

  it('computes quotient of a vec4u and a number', () => {
    expect(div(vec4u(2, 2, 2, 2), 2)).toEqual(vec4u(1));
    expect(div(vec4u(16, 16, 16, 16), 8)).toEqual(vec4u(2));
  });

  it('computes quotient of a vec4i and a number', () => {
    expect(div(vec4i(1, 2, 3, 4), -1)).toEqual(vec4i(-1, -2, -3, -4));
    expect(div(vec4i(0, 0, 0, 0), 1)).toEqual(vec4i());
    expect(div(vec4i(16, 16, 16, 16), 8)).toEqual(vec4i(2));
  });

  it('computes quotient of a vec4f and a vec4f', () => {
    expect(div(vec4f(1.5, 2, 3, 4), vec4f(2, 2, 2, 2))).toEqual(
      vec4f(0.75, 1, 1.5, 2),
    );
    expect(div(vec4f(0.09, 0.09, 0.09, 0.09), vec4f(0.3))).toEqual(vec4f(0.3));
  });

  it('computes quotient of a vec4u and a vec4u', () => {
    expect(div(vec4u(2, 2, 2, 2), vec4u(2))).toEqual(vec4u(1));
    expect(div(vec4u(16, 16, 16, 16), vec4u(8))).toEqual(vec4u(2));
  });

  it('computes quotient of a vec4i and a vec4i', () => {
    expect(div(vec4i(1, 2, 3, 4), vec4i(-1))).toEqual(vec4i(-1, -2, -3, -4));
    expect(div(vec4i(0, 0, 0, 0), vec4i(1))).toEqual(vec4i());
    expect(div(vec4i(16, 16, 16, 16), vec4i(8))).toEqual(vec4i(2));
  });
});
