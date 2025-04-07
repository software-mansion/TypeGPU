import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec4f } from '../../../src/data';
import { length } from '../../../src/std';

describe('length', () => {
  it('computes length of vec2f', () => {
    expect(length(vec2f(0, 0))).toEqual(0);
    expect(length(vec2f(1, 0))).toEqual(1);
    expect(length(vec2f(-1, 0))).toEqual(1);
    expect(length(vec2f(0, 1))).toEqual(1);
    expect(length(vec2f(0, -1))).toEqual(1);
    expect(length(vec2f(3, 4))).toEqual(5);
  });

  it('computes length of vec3f', () => {
    expect(length(vec3f(0, 0, 0))).toEqual(0);
    expect(length(vec3f(1, 0, 0))).toEqual(1);
    expect(length(vec3f(-1, 0, 0))).toEqual(1);
    expect(length(vec3f(3, 4, 0))).toEqual(5);
    expect(length(vec3f(1, 1, 1))).toEqual(Math.sqrt(3));
  });

  it('computes length of vec3f', () => {
    expect(length(vec4f(0, 0, 0, 0))).toEqual(0);
    expect(length(vec4f(1, 1, 1, 1))).toEqual(2);
    expect(length(vec4f(1, 0, 0, 0))).toEqual(1);
    expect(length(vec4f(-1, 0, 0, 0))).toEqual(1);
  });
});
