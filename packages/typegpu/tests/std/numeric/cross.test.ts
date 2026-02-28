import { describe, expect, it } from 'vitest';
import { vec3f, vec3h } from '../../../src/data/index.ts';
import { cross } from '../../../src/std/index.ts';

describe('cross', () => {
  it('computes cross product of two vec3f', () => {
    expect(cross(vec3f(0, 0, 0), vec3f(0, 1, 0))).toStrictEqual(vec3f());
    expect(cross(vec3f(1.5, 0, 0), vec3f(1.5, 0, 0))).toStrictEqual(vec3f());
    expect(cross(vec3f(-1, 1, 0), vec3f(1, 0, 1))).toStrictEqual(vec3f(1, 1, -1));
  });

  it('computes cross product of two vec3h', () => {
    expect(cross(vec3h(0, 0, 0), vec3h(0, 1, 0))).toStrictEqual(vec3h());
    expect(cross(vec3h(1, 0, 0), vec3h(1, 0, 0))).toStrictEqual(vec3h());
    expect(cross(vec3h(-1, 1, 0), vec3h(1, 0, 1))).toStrictEqual(vec3h(1, 1, -1));
    expect(cross(vec3h(2, 2, 0), vec3h(1, 4, 1))).toStrictEqual(vec3h(2, -2, 6));
  });
});
