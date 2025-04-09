import { describe, expect, it } from 'vitest';
import { vec2b, vec3b, vec4b } from '../../../src/data/index.ts';
import { all } from '../../../src/std/boolean.ts';

describe('all', () => {
  it('calculates for 2 element vectors', () => {
    expect(all(vec2b(false, false))).toBe(false);
    expect(all(vec2b(true, false))).toBe(false);
    expect(all(vec2b(true, true))).toBe(true);
  });

  it('calculates for 3 element vectors', () => {
    expect(all(vec3b(false, false, false))).toBe(false);
    expect(all(vec3b(false, false, true))).toBe(false);
    expect(all(vec3b(true, true, false))).toBe(false);
    expect(all(vec3b(true, true, true))).toBe(true);
  });

  it('calculates for 4 element vectors', () => {
    expect(all(vec4b(false, false, false, false))).toBe(false);
    expect(all(vec4b(false, false, true, false))).toBe(false);
    expect(all(vec4b(true, true, false, false))).toBe(false);
    expect(all(vec4b(true, true, false, true))).toBe(false);
    expect(all(vec4b(true, true, true, true))).toBe(true);
  });
});
