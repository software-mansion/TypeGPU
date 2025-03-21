import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec4f } from '../../../src/data';
import { normalize } from '../../../src/std';

describe('normalize', () => {
  it('computes normalized vector from vec2f', () => {
    expect(normalize(vec2f(1, 1)).x).toBeCloseTo(Math.sqrt(2) / 2);
    expect(normalize(vec2f(3, 4))).toEqual(vec2f(0.6, 0.8));
  });

  it('computes normalized vector from vec3f', () => {
    expect(normalize(vec3f(1, 1, 0)).y).toBeCloseTo(Math.sqrt(2) / 2);
    expect(normalize(vec3f(0, 3, 4))).toEqual(vec3f(0, 0.6, 0.8));
  });

  it('computes normalized vector from vec4f', () => {
    expect(normalize(vec4f(1, 0, 1, 0)).z).toBeCloseTo(Math.sqrt(2) / 2);
    expect(normalize(vec4f(0, 3, 0, 4))).toEqual(vec4f(0, 0.6, 0, 0.8));
  });
});
