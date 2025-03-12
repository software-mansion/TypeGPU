import { describe, expect, it } from 'vitest';
import { vec2h, vec3h, vec4h, vec2f, vec3f, vec4f } from '../../src/data';
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

  it('applies precision correctly', () => {
    // default precision of 2
    expect(isCloseTo(vec2h(0, 0), vec2h(0, 0.009))).toBeTruthy();
    expect(isCloseTo(vec2h(0, 0), vec2h(0, 0.011))).toBeFalsy();

    expect(isCloseTo(vec2h(0, 0), vec2h(0, 0.09), 1)).toBeTruthy();
    expect(isCloseTo(vec2h(0, 0), vec2h(0, 0.11), 1)).toBeFalsy();

    expect(isCloseTo(vec2h(0, 0), vec2h(0, 0.0009), 3)).toBeTruthy();
    expect(isCloseTo(vec2h(0, 0), vec2h(0, 0.0011), 3)).toBeFalsy();

    expect(isCloseTo(vec2h(0, 0), vec2h(0, 9), -1)).toBeTruthy();
    expect(isCloseTo(vec2h(0, 0), vec2h(0, 11), -1)).toBeFalsy();
  });
});
