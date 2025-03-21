import { describe, expect, it } from 'vitest';
import { vec2b, vec3b, vec4b } from '../../../src/data';
import { or } from '../../../src/std/boolean';

describe('or', () => {
  it('ors vectors', () => {
    expect(or(vec2b(false, false), vec2b(true, false))).toEqual(
      vec2b(true, false),
    );
    expect(or(vec3b(false, true, false), vec3b(true, false, false))).toEqual(
      vec3b(true, true, false),
    );
    expect(
      or(vec4b(false, true, false, true), vec4b(false, false, true, true)),
    ).toEqual(vec4b(false, true, true, true));
  });
});
