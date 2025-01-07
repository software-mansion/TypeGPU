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
} from '../../src/data';
import { mul } from '../../src/std';

describe('mul', () => {
  it('computes product of a number and vec2f', () => {
    expect(mul(17, vec2f(0, 0))).toEqual(vec2f(0, 0));
    expect(mul(0.4, vec2f(0.6, 0)).x).toBeCloseTo(0.24);
    expect(mul(0, vec2f(1, 0))).toEqual(vec2f());
  });

  it('computes product of a number and vec2u', () => {
    expect(mul(2, vec2u(0, 0))).toEqual(vec2u(0, 0));
    expect(mul(3, vec2u(1, 1))).toEqual(vec2u(3));
  });

  it('computes product of a number and vec2i', () => {
    expect(mul(9, vec2i(0, 0))).toEqual(vec2i(0, 0));
    expect(mul(-3, vec2i(1, 1))).toEqual(vec2i(-3));
    expect(mul(0, vec2i(1, 1))).toEqual(vec2i());
  });

  it('computes product of a number and vec3f', () => {
    expect(mul(2, vec3f(-1.5, -2, -3))).toEqual(vec3f(-3, -4, -6));
    expect(mul(-2, vec3f(1))).toEqual(vec3f(-2));
    expect(mul(0, vec3f(2, 3, 4))).toEqual(vec3f());
  });

  it('computes product of a number and vec3u', () => {
    expect(mul(2, vec3u(1, 1, 1))).toEqual(vec3u(2));
    expect(mul(0, vec3u(1))).toEqual(vec3u());
  });

  it('computes product of a number and vec3i', () => {
    expect(mul(1, vec3i(-1, -2, -3))).toEqual(vec3i(-1, -2, -3));
    expect(mul(-2, vec3i(2, 3, 4))).toEqual(vec3i(-4, -6, -8));
    expect(mul(0, vec3i(2))).toEqual(vec3i());
  });

  it('computes product of a number and vec4f', () => {
    expect(mul(0, vec4f(1.5, 2, 3, 4))).toEqual(vec4f());
    expect(mul(2, vec4f(2, 3.5, 4, 5))).toEqual(vec4f(4, 7, 8, 10));
    expect(mul(0.3, vec4f(0.3))).toEqual(vec4f(0.09));
  });

  it('computes product of a number and vec4u', () => {
    expect(mul(2, vec4u(1, 1, 1, 1))).toEqual(vec4u(2));
    expect(mul(8, vec4u(2))).toEqual(vec4u(16));
  });

  it('computes product of a number and vec4i', () => {
    expect(mul(-1, vec4i(-1, -2, -3, -4))).toEqual(vec4i(1, 2, 3, 4));
    expect(mul(0, vec4i(1))).toEqual(vec4i());
    expect(mul(8, vec4i(2))).toEqual(vec4i(16));
  });
});
