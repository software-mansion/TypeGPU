import { describe, expect, it } from 'vitest';
import { vec2f, vec2h, vec3f, vec3h, vec4f, vec4h } from '../../../src/data/index.ts';
import { isCloseTo } from '../../../src/std/index.ts';
import { exp2 } from '../../../src/std/numeric.ts';

describe('exp2', () => {
  it('computes exp2 of a number', () => {
    expect(exp2(0)).toBeCloseTo(1);
    expect(exp2(1)).toBeCloseTo(2);
    expect(exp2(2)).toBeCloseTo(4);
    expect(exp2(-1)).toBeCloseTo(0.5);
    expect(exp2(-2)).toBeCloseTo(0.25);
  });

  it('computes exp2 of vec2f', () => {
    const input = vec2f(0, 1);
    const expected = vec2f(2 ** 0, 2 ** 1);
    expect(isCloseTo(exp2(input), expected)).toBe(true);
  });

  it('computes exp2 of vec3f', () => {
    const input = vec3f(0, 1, -1);
    const expected = vec3f(2 ** 0, 2 ** 1, 2 ** -1);
    expect(isCloseTo(exp2(input), expected)).toBe(true);
  });

  it('computes exp2 of vec4f', () => {
    const input = vec4f(0, 1, -1, 2);
    const expected = vec4f(2 ** 0, 2 ** 1, 2 ** -1, 2 ** 2);
    expect(isCloseTo(exp2(input), expected)).toBe(true);
  });

  it('computes exp2 of vec2h', () => {
    const input = vec2h(0, 1);
    const expected = vec2h(2 ** 0, 2 ** 1);
    const result = exp2(input);
    expect(result.x).toBeCloseTo(expected.x);
    expect(result.y).toBeCloseTo(expected.y);
  });

  it('computes exp2 of vec3h', () => {
    const input = vec3h(0, 1, -1);
    const expected = vec3h(2 ** 0, 2 ** 1, 2 ** -1);
    const result = exp2(input);
    expect(result.x).toBeCloseTo(expected.x);
    expect(result.y).toBeCloseTo(expected.y);
    expect(result.z).toBeCloseTo(expected.z);
  });

  it('computes exp2 of vec4h', () => {
    const input = vec4h(0, 1, -1, 2);
    const expected = vec4h(2 ** 0, 2 ** 1, 2 ** -1, 2 ** 2);
    const result = exp2(input);
    expect(result.x).toBeCloseTo(expected.x);
    expect(result.y).toBeCloseTo(expected.y);
    expect(result.z).toBeCloseTo(expected.z);
    expect(result.w).toBeCloseTo(expected.w);
  });
});
