import { describe, expect, it } from 'vitest';
import { vec2b, vec3b, vec4b } from '../../../src/data';
import { not } from '../../../src/std/boolean';

describe('neg', () => {
  it('negates', () => {
    expect(not(vec2b(true, false))).toEqual(vec2b(false, true));
    expect(not(vec3b(false, false, true))).toEqual(vec3b(true, true, false));
    expect(not(vec4b(true, true, false, false))).toEqual(
      vec4b(false, false, true, true),
    );
  });
});
