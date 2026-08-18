import { describe, expect, it } from 'vitest';
import { vec2b, vec2f, vec3b, vec4b } from 'typegpu/data';
import { all } from 'typegpu/std';

describe('all', () => {
  it('calculates for 2 element vectors', () => {
    expect(all(vec2b(false, false))).toBe(false);
    expect(all(vec2b(true, false))).toBe(false);
    expect(all(vec2b(true, true))).toBe(true);
  });

  it('calculates for 3 element vectors', () => {
    expect(all(vec3b(false, false, false))).toBe(false);
    expect(all(vec3b(false, false, true))).toBe(false);
    expect(all(vec3b(true, true, false))).toBe(false);
    expect(all(vec3b(true, true, true))).toBe(true);
  });

  it('calculates for 4 element vectors', () => {
    expect(all(vec4b(false, false, false, false))).toBe(false);
    expect(all(vec4b(false, false, true, false))).toBe(false);
    expect(all(vec4b(true, true, false, false))).toBe(false);
    expect(all(vec4b(true, true, false, true))).toBe(false);
    expect(all(vec4b(true, true, true, true))).toBe(true);
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => all(vec2f())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected one of 'boolean, vec2<bool>, vec3<bool>, vec4<bool>', got 'vec2f']`,
    );
  });
});
