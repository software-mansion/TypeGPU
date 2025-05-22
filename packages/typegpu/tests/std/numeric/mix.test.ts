import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec4h } from '../../../src/data/index.ts';
import { mix } from '../../../src/std/index.ts';

describe('mix', () => {
  it('should blend scalar values correctly', () => {
    expect(mix(10, 20, 0)).toBe(10);
    expect(mix(10, 20, 1)).toBe(20);
    expect(mix(10, 20, 0.5)).toBe(15);
  });

  it('should blend vector values with vector blending factor correctly', () => {
    const v1 = vec2f(1, 2);
    const v2 = vec2f(3, 4);
    const factor = vec2f(0, 1);
    // Expected: [1 * (1 - 0) + 3 * 0, 2 * (1 - 1) + 4 * 1] = [1, 4]
    const result = mix(v1, v2, factor);
    expect(result).toStrictEqual(vec2f(1, 4));
  });

  it('should blend vector values with scalar blending factor correctly', () => {
    const v1 = vec3f(1, 2, 3);
    const v2 = vec3f(4, 5, 6);
    // Expected: [1 * (1 - 0.5) + 4 * 0.5, 2 * (1 - 0.5) + 5 * 0.5, 3 * (1 - 0.5) + 6 * 0.5]
    //          = [2.5, 3.5, 4.5]
    const result = mix(v1, v2, 0.5);
    expect(result).toStrictEqual(vec3f(2.5, 3.5, 4.5));
  });

  it('should blend higher dimension vectors correctly', () => {
    const v1 = vec4h(0, 0, 0, 0);
    const v2 = vec4h(1, 1, 1, 1);
    // Expected: Each component = 0 * (1 - 0.25) + 1 * 0.25 = 0.25
    const result = mix(v1, v2, 0.25);
    expect(result).toStrictEqual(vec4h(0.25, 0.25, 0.25, 0.25));
  });

  it('should blend non-integer scalar values correctly', () => {
    expect(mix(1.5, 2.5, 0)).toBeCloseTo(1.5);
    expect(mix(1.5, 2.5, 1)).toBeCloseTo(2.5);
    // 1.5*(1 - 0.3) + 2.5*0.3 = 1.05 + 0.75 = 1.8
    expect(mix(1.5, 2.5, 0.3)).toBeCloseTo(1.8);
  });

  it('should blend vector values with non-integer values and blending factor correctly', () => {
    const v1 = vec2f(1.1, 2.2);
    const v2 = vec2f(3.3, 4.4);
    const factor = vec2f(0.3, 0.7);
    // Expected for first component: 1.1*(1 - 0.3) + 3.3*0.3 = 0.77 + 0.99 = 1.76
    // Expected for second component: 2.2*(1 - 0.7) + 4.4*0.7 = 0.66 + 3.08 = 3.74
    const result = mix(v1, v2, factor);
    expect(result.x).toBeCloseTo(1.76);
    expect(result.y).toBeCloseTo(3.74);
  });
});
