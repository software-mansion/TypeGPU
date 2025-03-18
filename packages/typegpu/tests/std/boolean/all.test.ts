import { describe, expect, it } from 'vitest';
import { vec2b, vec3b, vec4b } from '../../../src/data';
import { all } from '../../../src/std/boolean';

describe('all', () => {
  it('calculates for 2 element vectors', () => {
    expect(all(vec2b(false, false))).toBeFalsy();
    expect(all(vec2b(true, false))).toBeFalsy();
    expect(all(vec2b(true, true))).toBeTruthy();
  });

  it('calculates for 3 element vectors', () => {
    expect(all(vec3b(false, false, false))).toBeFalsy();
    expect(all(vec3b(false, false, true))).toBeFalsy();
    expect(all(vec3b(true, true, false))).toBeFalsy();
    expect(all(vec3b(true, true, true))).toBeTruthy();
  });

  it('calculates for 4 element vectors', () => {
    expect(all(vec4b(false, false, false, false))).toBeFalsy();
    expect(all(vec4b(false, false, true, false))).toBeFalsy();
    expect(all(vec4b(true, true, false, false))).toBeFalsy();
    expect(all(vec4b(true, true, false, true))).toBeFalsy();
    expect(all(vec4b(true, true, true, true))).toBeTruthy();
  });
});
