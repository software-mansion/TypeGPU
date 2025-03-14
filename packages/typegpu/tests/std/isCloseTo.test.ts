import { describe, expect, it } from 'vitest';
import { vec2f, vec2h, vec3f, vec3h, vec4f, vec4h } from '../../src/data';
import { isCloseTo } from '../../src/std/numeric';

describe('isCloseTo', () => {
  it('returns true for close f32 containers', () => {
    expect(isCloseTo(vec2f(0, 0), vec2f(0.0012, -0.009))).toBeTruthy();
    expect(
      isCloseTo(vec3f(1.05, -2.18, 1.22), vec3f(1.05, -2.17777, 1.229)),
    ).toBeTruthy();
    expect(
      isCloseTo(
        vec4f(3.8, -4.87, -2.42, -1.97),
        vec4f(3.794, -4.861, -2.412, -1.971),
      ),
    ).toBeTruthy();
  });

  it('returns true for close f16 containers', () => {
    expect(isCloseTo(vec2h(0, 0), vec2h(0.0012, -0.009))).toBeTruthy();
    expect(
      isCloseTo(vec3h(1.05, -2.18, 1.22), vec3h(1.05, -2.17777, 1.229)),
    ).toBeTruthy();
    expect(
      isCloseTo(
        vec4h(3.8, -4.87, -2.42, -1.97),
        vec4h(3.794, -4.861, -2.412, -1.971),
      ),
    ).toBeTruthy();
  });

  it('returns true for close numbers', () => {
    expect(isCloseTo(0, 0.009)).toBeTruthy();
    expect(isCloseTo(0, 0.0009)).toBeTruthy();
  });

  it('returns false for distant f32 containers', () => {
    expect(isCloseTo(vec2f(0, 0), vec2f(0, 1))).toBeFalsy();
    expect(isCloseTo(vec3f(100, 100, 100), vec3f(101, 100, 100))).toBeFalsy();
    expect(
      isCloseTo(vec4f(1, 2, 3, 4), vec4f(1.02, 2.02, 3.02, 4.02)),
    ).toBeFalsy();
  });

  it('returns false for distant f16 containers', () => {
    expect(isCloseTo(vec2h(0, 0), vec2h(0, 1))).toBeFalsy();
    expect(isCloseTo(vec3h(100, 100, 100), vec3h(101, 100, 100))).toBeFalsy();
    expect(
      isCloseTo(vec4h(1, 2, 3, 4), vec4h(1.02, 2.02, 3.02, 4.02)),
    ).toBeFalsy();
  });

  it('returns false for distant numbers', () => {
    expect(isCloseTo(0, 0.9)).toBeFalsy();
    expect(isCloseTo(0, 0.09)).toBeFalsy();
  });

  it('applies precision correctly', () => {
    // default precision of 0.01
    expect(isCloseTo(vec2h(0, 0), vec2h(0, 0.009))).toBeTruthy();
    expect(isCloseTo(vec2h(0, 0), vec2h(0, 0.011))).toBeFalsy();

    expect(isCloseTo(vec2h(0, 0), vec2h(0, 0.09), 0.1)).toBeTruthy();
    expect(isCloseTo(vec2h(0, 0), vec2h(0, 0.11), 0.1)).toBeFalsy();

    expect(isCloseTo(vec2h(0, 0), vec2h(0, 0.0009), 0.001)).toBeTruthy();
    expect(isCloseTo(vec2h(0, 0), vec2h(0, 0.0011), 0.001)).toBeFalsy();

    expect(isCloseTo(vec2h(0, 0), vec2h(0, 9), 10)).toBeTruthy();
    expect(isCloseTo(vec2h(0, 0), vec2h(0, 11), 10)).toBeFalsy();
  });
});
