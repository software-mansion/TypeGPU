import { describe, expect, it } from 'vitest';
import { vec2f, vec3f } from '../../src/data';
import { std } from '../../src/std';

describe('dot', () => {
  it('computes dot product of two vec2f', () => {
    expect(std.dot(vec2f(0, 0), vec2f(0, 0))).toEqual(0);
    expect(std.dot(vec2f(1, 0), vec2f(1, 0))).toEqual(1);
    expect(std.dot(vec2f(-1, 1), vec2f(1, 0))).toEqual(-1);
  });

  it('computes dot product of two vec3f', () => {
    expect(std.dot(vec3f(0, 0, 0), vec3f(0, 1, 0))).toEqual(0);
    expect(std.dot(vec3f(1, 0, 0), vec3f(1, 0, 0))).toEqual(1);
    expect(std.dot(vec3f(-1, 1, 0), vec3f(1, 0, 1))).toEqual(-1);
  });

  it('dot of the same vec2f is its length squared', () => {
    const v1 = vec2f(2, 2);
    const v2 = vec2f(-1, 1);

    expect(std.dot(v1, v1)).toEqual(8);
    expect(std.dot(v2, v2)).toEqual(2);
  });
});
