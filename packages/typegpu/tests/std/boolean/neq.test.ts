import { describe, expect, it } from 'vitest';
import {
  vec2b,
  vec2f,
  vec2u,
  vec3b,
  vec3f,
  vec3u,
  vec4b,
  vec4f,
  vec4u,
} from '../../../src/data';
import { neq } from '../../../src/std';

describe('neq', () => {
  it('compares integer vectors', () => {
    expect(neq(vec2u(1, 0), vec2u(0, 0))).toEqual(vec2b(true, false));
    expect(neq(vec3u(10, 20, 40), vec3u(10, 20, 30))).toEqual(
      vec3b(false, false, true),
    );
    expect(neq(vec4u(1, 2, 3, 4), vec4u(4, 2, 3, 1))).toEqual(
      vec4b(true, false, false, true),
    );
  });

  it('compares float vectors', () => {
    expect(neq(vec2f(0.1, 1.1), vec2f(0.1, 0))).toEqual(vec2b(false, true));
    expect(neq(vec3f(1.2, 2.3, 3.4), vec3f(2.3, 3.2, 3.4))).toEqual(
      vec3b(true, true, false),
    );
    expect(neq(vec4f(0.1, -0.2, -0.3, 0.4), vec4f(0.1, 0.2, 0.3, 0.4))).toEqual(
      vec4b(false, true, true, false),
    );
  });

  it('compares boolean vectors', () => {
    expect(neq(vec2b(true, true), vec2b(true, false))).toEqual(
      vec2b(false, true),
    );
    expect(neq(vec3b(false, false, false), vec3b(true, true, false))).toEqual(
      vec3b(true, true, false),
    );
    expect(
      neq(vec4b(true, false, true, false), vec4b(true, true, false, false)),
    ).toEqual(vec4b(false, true, true, false));
  });
});
