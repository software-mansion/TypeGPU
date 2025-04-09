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
} from '../../../src/data/index.ts';
import { sub } from '../../../src/std/index.ts';

describe('sub', () => {
  it('computes difference of two vec2f', () => {
    expect(sub(vec2f(0, 0), vec2f(0, 0))).toEqual(vec2f(0, 0));
    expect(sub(vec2f(1.2, 0), vec2f(1.0, 0)).x).toBeCloseTo(0.2);
    expect(sub(vec2f(-1.5, 1), vec2f(1, 0))).toEqual(vec2f(-2.5, 1));
  });

  it('computes difference of two vec2u', () => {
    expect(sub(vec2u(0, 0), vec2u(0, 0))).toEqual(vec2u(0, 0));
    expect(sub(vec2u(1, 2), vec2u(1, 0))).toEqual(vec2u(0, 2));
  });

  it('computes difference of two vec2i', () => {
    expect(sub(vec2i(0, 0), vec2i(0, 0))).toEqual(vec2i(0, 0));
    expect(sub(vec2i(1, 0), vec2i(1, 0))).toEqual(vec2i(0));
    expect(sub(vec2i(-1, 1), vec2i(1, 0))).toEqual(vec2i(-2, 1));
  });

  it('computes difference of two vec3f', () => {
    expect(sub(vec3f(1.5, 2, 3), vec3f(-1.5, -2, -3))).toEqual(vec3f(3, 4, 6));
    expect(sub(vec3f(1, 1, 1), vec3f(1))).toEqual(vec3f());
    expect(sub(vec3f(1.5), vec3f(2))).toEqual(vec3f(-0.5));
  });

  it('computes difference of two vec3u', () => {
    expect(sub(vec3u(2, 3, 4), vec3u(1, 1, 1))).toEqual(vec3u(1, 2, 3));
    expect(sub(vec3u(2), vec3u(1))).toEqual(vec3u(1));
  });

  it('computes difference of two vec3i', () => {
    expect(sub(vec3i(1, 2, 3), vec3i(-1, -2, -3))).toEqual(vec3i(2, 4, 6));
    expect(sub(vec3i(1, 1, 1), vec3i(2, 3, 4))).toEqual(vec3i(-1, -2, -3));
    expect(sub(vec3i(1), vec3i(2))).toEqual(vec3i(-1));
  });

  it('computes difference of two vec4f', () => {
    expect(sub(vec4f(1.5, 2, 3, 4), vec4f(1.5, 2, 3, 4))).toEqual(vec4f());
    expect(sub(vec4f(1, 1, 1, 1), vec4f(2, 3.5, 4, 5))).toEqual(
      vec4f(-1, -2.5, -3, -4),
    );
    expect(sub(vec4f(1), vec4f(2.5))).toEqual(vec4f(-1.5));
  });

  it('computes difference of two vec4u', () => {
    expect(sub(vec4u(2, 3, 4, 5), vec4u(1, 1, 1, 1))).toEqual(
      vec4u(1, 2, 3, 4),
    );
    expect(sub(vec4u(1), vec4u(1))).toEqual(vec4u());
  });

  it('computes difference of two vec4i', () => {
    expect(sub(vec4i(1, 2, 3, 4), vec4i(-1, -2, -3, -4))).toEqual(
      vec4i(2, 4, 6, 8),
    );
    expect(sub(vec4i(1, 1, 1, 1), vec4i(1))).toEqual(vec4i());
    expect(sub(vec4i(1), vec4i(2))).toEqual(vec4i(-1));
  });
});
