import { describe, expect, it } from 'vitest';
import { mat4x4f, vec2b, vec2f, vec2u, vec4b, vec4f, vec4u } from 'typegpu/data';
import { allEq } from 'typegpu/std';

describe('allEq', () => {
  it('compares integer vectors', () => {
    expect(allEq(vec2u(1, 0), vec2u(1, 0))).toBe(true);
    expect(allEq(vec2u(1, 0), vec2u(0, 0))).toBe(false);
    expect(allEq(vec4u(1, 2, 3, 4), vec4u(1, 2, 3, 4))).toBe(true);
    expect(allEq(vec4u(1, 2, 3, 4), vec4u(4, 2, 3, 1))).toBe(false);
  });

  it('compares float vectors', () => {
    expect(allEq(vec2f(1, 0), vec2f(1, 0))).toBe(true);
    expect(allEq(vec2f(1, 0), vec2f(0, 0))).toBe(false);
    expect(allEq(vec4f(1, 2, 3, 4), vec4f(1, 2, 3, 4))).toBe(true);
    expect(allEq(vec4f(1, 2, 3, 4), vec4f(4, 2, 3, 1))).toBe(false);
  });

  it('compares boolean vectors', () => {
    expect(allEq(vec2b(false, true), vec2b(false, true))).toBe(true);
    expect(allEq(vec2b(false, false), vec2b(false, true))).toBe(false);
    expect(allEq(vec4b(false, true, true, true), vec4b(false, true, true, true))).toBe(true);
    expect(allEq(vec4b(false, true, true, true), vec4b(false, true, false, true))).toBe(false);
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => allEq(mat4x4f(), mat4x4f())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected one of 'number, vec2i, vec3i, vec4i, vec2u, vec3u, vec4u, vec2f, vec3f, vec4f, vec2h, vec3h, vec4h, boolean, vec2<bool>, vec3<bool>, vec4<bool>', got 'mat4x4f']`,
    );
  });
});
