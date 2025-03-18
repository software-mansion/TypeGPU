import { describe, expect, it } from 'vitest';
import { vec3f, vec3i, vec3u } from '../../../src/data';
import { cross } from '../../../src/std';

describe('cross', () => {
  it('computes cross product of two vec3f', () => {
    expect(cross(vec3f(0, 0, 0), vec3f(0, 1, 0))).toEqual(vec3f());
    expect(cross(vec3f(1.5, 0, 0), vec3f(1.5, 0, 0))).toEqual(vec3f());
    expect(cross(vec3f(-1, 1, 0), vec3f(1, 0, 1))).toEqual(vec3f(1, 1, -1));
  });

  it('computes cross product of two vec3u', () => {
    expect(cross(vec3u(0, 0, 0), vec3u(0, 1, 0))).toEqual(vec3u());
    expect(cross(vec3u(2, 2, 4), vec3u(1, 1, 2))).toEqual(vec3u());
  });

  it('computes cross product of two vec3i', () => {
    expect(cross(vec3i(0, 0, 0), vec3i(0, 1, 0))).toEqual(vec3i());
    expect(cross(vec3i(1, 0, 0), vec3i(1, 0, 0))).toEqual(vec3i());
    expect(cross(vec3i(-1, 1, 0), vec3i(1, 0, 1))).toEqual(vec3i(1, 1, -1));
    expect(cross(vec3i(2, 2, 0), vec3i(1, 4, 1))).toEqual(vec3i(2, -2, 6));
  });
});
