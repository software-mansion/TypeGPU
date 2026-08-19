import { describe, expect, it } from 'vitest';
import { vec2b, vec2f, vec3b, vec4b } from 'typegpu/data';
import { any } from 'typegpu/std';

describe('any', () => {
  it('calculates for 2 element vectors', () => {
    expect(any(vec2b(false, false))).toBe(false);
    expect(any(vec2b(true, false))).toBe(true);
    expect(any(vec2b(true, true))).toBe(true);
  });

  it('calculates for 3 element vectors', () => {
    expect(any(vec3b(false, false, false))).toBe(false);
    expect(any(vec3b(false, false, true))).toBe(true);
    expect(any(vec3b(true, true, false))).toBe(true);
    expect(any(vec3b(true, true, true))).toBe(true);
  });

  it('calculates for 4 element vectors', () => {
    expect(any(vec4b(false, false, false, false))).toBe(false);
    expect(any(vec4b(false, false, true, false))).toBe(true);
    expect(any(vec4b(true, true, false, false))).toBe(true);
    expect(any(vec4b(true, true, false, true))).toBe(true);
    expect(any(vec4b(true, true, true, true))).toBe(true);
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => any(vec2f())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected one of 'boolean, vec2<bool>, vec3<bool>, vec4<bool>', got 'vec2f']`,
    );
  });
});
