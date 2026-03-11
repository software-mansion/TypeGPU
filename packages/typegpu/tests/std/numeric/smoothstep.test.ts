import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec4f } from '../../../src/data/index.ts';
import { smoothstep } from '../../../src/std/index.ts';
import { isCloseTo } from '../../../src/std/boolean.ts';

describe('smoothstep', () => {
  it('returns 0 when x is less than or equal to edge0', () => {
    expect(smoothstep(0, 1, -0.5)).toBe(0);
    expect(smoothstep(0, 1, 0)).toBe(0);
  });

  it('returns 1 when x is greater than or equal to edge1', () => {
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 1.5)).toBe(1);
  });

  it('returns smoothly interpolated value between 0 and 1 when x is between edge0 and edge1', () => {
    expect(smoothstep(0, 1, 0.25)).toBeCloseTo(0.15625); // t = 0.25, t² * (3 - 2t) = 0.15625
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5); // t = 0.5, t² * (3 - 2t) = 0.5
    expect(smoothstep(0, 1, 0.75)).toBeCloseTo(0.84375); // t = 0.75, t² * (3 - 2t) = 0.84375
  });

  it('works with vec2f', () => {
    // all components less than edge0
    const result1 = smoothstep(vec2f(0.3, 0.5), vec2f(0.8, 0.9), vec2f(0.1, 0.2));
    expect(isCloseTo(result1, vec2f(0, 0))).toBe(true);

    // all components greater than edge1
    const result2 = smoothstep(vec2f(0.3, 0.5), vec2f(0.8, 0.9), vec2f(0.9, 1.0));
    expect(isCloseTo(result2, vec2f(1, 1))).toBe(true);

    // components between edge0 and edge1
    const result3 = smoothstep(vec2f(0.3, 0.5), vec2f(0.8, 0.9), vec2f(0.55, 0.7));
    expect(isCloseTo(result3, vec2f(0.5, 0.5))).toBe(true);

    // mixed results
    const result4 = smoothstep(vec2f(0.3, 0.5), vec2f(0.8, 0.9), vec2f(0.2, 0.95));
    expect(isCloseTo(result4, vec2f(0, 1))).toBe(true);
  });

  it('works with vec3f', () => {
    const result = smoothstep(vec3f(0.1, 0.2, 0.3), vec3f(0.6, 0.7, 0.8), vec3f(0.35, 0.7, 0.55));
    expect(isCloseTo(result, vec3f(0.5, 1, 0.5))).toBe(true);
  });

  it('works with vec4f', () => {
    const result = smoothstep(
      vec4f(0.0, 0.1, 0.2, 0.3),
      vec4f(1.0, 0.9, 0.8, 0.7),
      vec4f(0.0, 0.5, 0.8, 0.7),
    );
    expect(isCloseTo(result, vec4f(0, 0.5, 1, 1))).toBe(true);
  });

  it('works with vector edges with same values for all components', () => {
    const result = smoothstep(vec3f(0.3, 0.3, 0.3), vec3f(0.7, 0.7, 0.7), vec3f(0.2, 0.5, 0.8));
    // For first component: x < edge0, result = 0
    // For second component: t = (0.5-0.3)/(0.7-0.3) = 0.5, result = 0.5
    // For third component: x > edge1, result = 1
    expect(isCloseTo(result, vec3f(0, 0.5, 1))).toBe(true);
  });

  it('handles edge case with equal edge values', () => {
    expect(smoothstep(0.5, 0.5, 0.4)).toBe(0);
    expect(smoothstep(0.5, 0.5, 0.5)).toBe(0);
    expect(smoothstep(0.5, 0.5, 0.6)).toBe(0);

    const result = smoothstep(vec2f(0.5, 0.3), vec2f(0.5, 0.3), vec2f(0.4, 0.3));
    expect(isCloseTo(result, vec2f(0, 1))).toBe(false);
  });

  it('handles reversed edge values (edge0 > edge1)', () => {
    expect(smoothstep(0.8, 0.2, 0.5)).toBeCloseTo(0.5);

    const result = smoothstep(vec2f(0.8, 0.7), vec2f(0.2, 0.3), vec2f(0.5, 0.5));
    expect(isCloseTo(result, vec2f(0.5, 0.5))).toBe(true);
  });

  it('handles negative values correctly', () => {
    expect(smoothstep(-2, -1, -1.5)).toBeCloseTo(0.5);
    expect(smoothstep(-10, -5, -20)).toBe(0);
    expect(smoothstep(-10, -5, 0)).toBe(1);

    const result = smoothstep(vec3f(-1, 0, -10), vec3f(1, 1, -5), vec3f(0, 0.5, -7.5));
    expect(isCloseTo(result, vec3f(0.5, 0.5, 0.5))).toBe(true);
  });

  it('handles very small differences between edges', () => {
    expect(smoothstep(0.5, 0.5001, 0.50005)).toBeCloseTo(0.5);

    const result = smoothstep(vec2f(0.1, 0.2), vec2f(0.1001, 0.2001), vec2f(0.1, 0.20005));
    expect(isCloseTo(result, vec2f(0, 0.5))).toBe(true);
  });

  it('handles extreme values', () => {
    expect(smoothstep(1000, 2000, 1500)).toBeCloseTo(0.5);

    expect(smoothstep(0.00001, 0.00002, 0.000015)).toBeCloseTo(0.5);

    const result = smoothstep(
      vec3f(0.00001, 1000, 0),
      vec3f(0.00002, 2000, 1),
      vec3f(0.000015, 1500, 0.5),
    );
    expect(isCloseTo(result, vec3f(0.5, 0.5, 0.5))).toBe(true);
  });
});
