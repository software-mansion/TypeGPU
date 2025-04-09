import { describe, expect, it } from 'vitest';
import { vec2b, vec3b, vec4b } from '../../../src/data/index.ts';
import { any } from '../../../src/std/boolean.ts';

describe('any', () => {
  it('calculates for 2 element vectors', () => {
    expect(any(vec2b(false, false))).toBe(false);
    expect(any(vec2b(true, false))).toBe(true);
    expect(any(vec2b(true, true))).toBe(true);
  });

  it('calculates for 3 element vectors', () => {
    expect(any(vec3b(false, false, false))).toBe(false);
    expect(any(vec3b(false, false, true))).toBe(true);
    expect(any(vec3b(true, true, false))).toBe(true);
    expect(any(vec3b(true, true, true))).toBe(true);
  });

  it('calculates for 4 element vectors', () => {
    expect(any(vec4b(false, false, false, false))).toBe(false);
    expect(any(vec4b(false, false, true, false))).toBe(true);
    expect(any(vec4b(true, true, false, false))).toBe(true);
    expect(any(vec4b(true, true, false, true))).toBe(true);
    expect(any(vec4b(true, true, true, true))).toBe(true);
  });
});
