import { describe, expect, it } from 'vitest';
import { vec2f, vec2i, vec3f, vec4f } from 'typegpu/data';
import { length } from 'typegpu/std';

describe('length', () => {
  it('computes length of vec2f', () => {
    expect(length(vec2f(0, 0))).toBe(0);
    expect(length(vec2f(1, 0))).toBe(1);
    expect(length(vec2f(-1, 0))).toBe(1);
    expect(length(vec2f(0, 1))).toBe(1);
    expect(length(vec2f(0, -1))).toBe(1);
    expect(length(vec2f(3, 4))).toBe(5);
  });

  it('computes length of vec3f', () => {
    expect(length(vec3f(0, 0, 0))).toBe(0);
    expect(length(vec3f(1, 0, 0))).toBe(1);
    expect(length(vec3f(-1, 0, 0))).toBe(1);
    expect(length(vec3f(3, 4, 0))).toBe(5);
    expect(length(vec3f(1, 1, 1))).toBeCloseTo(Math.sqrt(3));
  });

  it('computes length of vec3f', () => {
    expect(length(vec4f(0, 0, 0, 0))).toBe(0);
    expect(length(vec4f(1, 1, 1, 1))).toBe(2);
    expect(length(vec4f(1, 0, 0, 0))).toBe(1);
    expect(length(vec4f(-1, 0, 0, 0))).toBe(1);
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => length(vec2i(1, 2))).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected one of 'number, vec2f, vec3f, vec4f, vec2h, vec3h, vec4h', got 'vec2i'.]`,
    );
  });
});
