import { describe, expect, it } from 'vitest';
import { vec2b, vec3b, vec4b } from '../../../src/data/index.ts';
import { not } from '../../../src/std/boolean.ts';

describe('neg', () => {
  it('negates', () => {
    expect(not(vec2b(true, false))).toStrictEqual(vec2b(false, true));
    expect(not(vec3b(false, false, true))).toStrictEqual(vec3b(true, true, false));
    expect(not(vec4b(true, true, false, false))).toStrictEqual(vec4b(false, false, true, true));
  });
});
