import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec4f } from '../../../src/data/index.ts';
import { length } from '../../../src/std/index.ts';

describe('length', () => {
  it('computes length of vec2f', () => {
    expect(length(vec2f(0, 0))).toStrictEqual(0);
    expect(length(vec2f(1, 0))).toStrictEqual(1);
    expect(length(vec2f(-1, 0))).toStrictEqual(1);
    expect(length(vec2f(0, 1))).toStrictEqual(1);
    expect(length(vec2f(0, -1))).toStrictEqual(1);
    expect(length(vec2f(3, 4))).toStrictEqual(5);
  });

  it('computes length of vec3f', () => {
    expect(length(vec3f(0, 0, 0))).toStrictEqual(0);
    expect(length(vec3f(1, 0, 0))).toStrictEqual(1);
    expect(length(vec3f(-1, 0, 0))).toStrictEqual(1);
    expect(length(vec3f(3, 4, 0))).toStrictEqual(5);
    expect(length(vec3f(1, 1, 1))).toStrictEqual(Math.sqrt(3));
  });

  it('computes length of vec3f', () => {
    expect(length(vec4f(0, 0, 0, 0))).toStrictEqual(0);
    expect(length(vec4f(1, 1, 1, 1))).toStrictEqual(2);
    expect(length(vec4f(1, 0, 0, 0))).toStrictEqual(1);
    expect(length(vec4f(-1, 0, 0, 0))).toStrictEqual(1);
  });
});
