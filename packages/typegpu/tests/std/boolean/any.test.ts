import { describe, expect, it } from 'vitest';
import { vec2b, vec3b, vec4b } from '../../../src/data';
import { any } from '../../../src/std/boolean';

describe('any', () => {
  it('calculates for 2 element vectors', () => {
    expect(any(vec2b(false, false))).toBeFalsy();
    expect(any(vec2b(true, false))).toBeTruthy();
    expect(any(vec2b(true, true))).toBeTruthy();
  });

  it('calculates for 3 element vectors', () => {
    expect(any(vec3b(false, false, false))).toBeFalsy();
    expect(any(vec3b(false, false, true))).toBeTruthy();
    expect(any(vec3b(true, true, false))).toBeTruthy();
    expect(any(vec3b(true, true, true))).toBeTruthy();
  });

  it('calculates for 4 element vectors', () => {
    expect(any(vec4b(false, false, false, false))).toBeFalsy();
    expect(any(vec4b(false, false, true, false))).toBeTruthy();
    expect(any(vec4b(true, true, false, false))).toBeTruthy();
    expect(any(vec4b(true, true, false, true))).toBeTruthy();
    expect(any(vec4b(true, true, true, true))).toBeTruthy();
  });
});
