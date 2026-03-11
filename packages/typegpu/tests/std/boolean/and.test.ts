import { describe, expect, it } from 'vitest';
import { vec2b, vec3b, vec4b } from '../../../src/data/index.ts';
import { and } from '../../../src/std/boolean.ts';

describe('and', () => {
  it('and vectors', () => {
    expect(and(vec2b(true, true), vec2b(true, false))).toStrictEqual(vec2b(true, false));
    expect(and(vec3b(false, true, true), vec3b(true, false, true))).toStrictEqual(
      vec3b(false, false, true),
    );
    expect(and(vec4b(false, true, false, true), vec4b(false, false, true, true))).toStrictEqual(
      vec4b(false, false, false, true),
    );
  });
});
