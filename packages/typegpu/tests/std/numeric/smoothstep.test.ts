import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec4f } from '../../../src/data/index.ts';
import { smoothstep } from '../../../src/std/index.ts';

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

  it('works with arbitrary edge values', () => {
    expect(smoothstep(10, 20, 5)).toBe(0);
    expect(smoothstep(10, 20, 25)).toBe(1);
    expect(smoothstep(10, 20, 15)).toBeCloseTo(0.5);
    expect(smoothstep(-5, 5, 0)).toBeCloseTo(0.5);
  });

  it('works with vec2f', () => {
    // all components less than edge0
    const result1 = smoothstep(
      vec2f(0.3, 0.5),
      vec2f(0.8, 0.9),
      vec2f(0.1, 0.2),
    );
    expect(result1).toStrictEqual(vec2f(0, 0));

    // all components greater than edge1
    const result2 = smoothstep(
      vec2f(0.3, 0.5),
      vec2f(0.8, 0.9),
      vec2f(0.9, 1.0),
    );
    expect(result2).toStrictEqual(vec2f(1, 1));

    // components between edge0 and edge1
    const result3 = smoothstep(
      vec2f(0.3, 0.5),
      vec2f(0.8, 0.9),
      vec2f(0.55, 0.7),
    );
    expect(result3.x).toBeCloseTo(0.5);
    expect(result3.y).toBeCloseTo(0.5);

    // mixed results
    const result4 = smoothstep(
      vec2f(0.3, 0.5),
      vec2f(0.8, 0.9),
      vec2f(0.2, 0.95),
    );
    expect(result4.x).toBe(0);
    expect(result4.y).toBe(1);
  });

  it('works with vec3f', () => {
    const result = smoothstep(
      vec3f(0.1, 0.2, 0.3),
      vec3f(0.6, 0.7, 0.8),
      vec3f(0.35, 0.7, 0.55),
    );
    expect(result.x).toBeCloseTo(0.5);
    expect(result.y).toBe(1);
    expect(result.z).toBeCloseTo(0.5);
  });

  it('works with vec4f', () => {
    const result = smoothstep(
      vec4f(0.0, 0.1, 0.2, 0.3),
      vec4f(1.0, 0.9, 0.8, 0.7),
      vec4f(0.0, 0.5, 0.8, 0.7),
    );
    expect(result.x).toBe(0);
    expect(result.y).toBeCloseTo(0.5);
    expect(result.z).toBe(1);
    expect(result.w).toBe(1);
  });

  it('works with vector edges with same values for all components', () => {
    const result = smoothstep(
      vec3f(0.3, 0.3, 0.3),
      vec3f(0.7, 0.7, 0.7),
      vec3f(0.2, 0.5, 0.8),
    );
    // For first component: x < edge0, result = 0
    // For second component: t = (0.5-0.3)/(0.7-0.3) = 0.5, result = 0.5
    // For third component: x > edge1, result = 1
    expect(result.x).toBe(0);
    expect(result.y).toBeCloseTo(0.5);
    expect(result.z).toBe(1);
  });
});
