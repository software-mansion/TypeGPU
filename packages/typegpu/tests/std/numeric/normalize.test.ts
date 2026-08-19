import { describe, expect, it } from 'vitest';
import { vec2f, vec2i, vec3f, vec4f } from 'typegpu/data';
import { normalize } from 'typegpu/std';

describe('normalize', () => {
  it('rounds the results exactly like WGSL would', () => {
    expect(normalize(vec3f(-1.0, 4.0, -1.0)).x).toBe(-0.2357022613286972); // checked empirically
  });

  it('computes normalized vector from vec2f', () => {
    expect(normalize(vec2f(1, 1)).x).toBeCloseTo(Math.sqrt(2) / 2);
    expect(normalize(vec2f(3, 4))).toStrictEqual(vec2f(0.6, 0.8));
  });

  it('computes normalized vector from vec3f', () => {
    expect(normalize(vec3f(1, 1, 0)).y).toBeCloseTo(Math.sqrt(2) / 2);
    expect(normalize(vec3f(0, 3, 4))).toStrictEqual(vec3f(0, 0.6, 0.8));
  });

  it('computes normalized vector from vec4f', () => {
    expect(normalize(vec4f(1, 0, 1, 0)).z).toBeCloseTo(Math.sqrt(2) / 2);
    expect(normalize(vec4f(0, 3, 0, 4))).toStrictEqual(vec4f(0, 0.6, 0, 0.8));
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => normalize(vec2i(1, 2))).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected one of 'number, vec2f, vec3f, vec4f, vec2h, vec3h, vec4h', got 'vec2i']`,
    );
  });
});
