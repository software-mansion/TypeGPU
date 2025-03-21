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
import { eq } from '../../../src/std';

describe('eq', () => {
  it('compares integer vectors', () => {
    expect(eq(vec2u(1, 0), vec2u(0, 0))).toEqual(vec2b(false, true));
    expect(eq(vec3u(10, 20, 40), vec3u(10, 20, 30))).toEqual(
      vec3b(true, true, false),
    );
    expect(eq(vec4u(1, 2, 3, 4), vec4u(4, 2, 3, 1))).toEqual(
      vec4b(false, true, true, false),
    );
  });

  it('compares float vectors', () => {
    expect(eq(vec2f(0.1, 1.1), vec2f(0.1, 0))).toEqual(vec2b(true, false));
    expect(eq(vec3f(1.2, 2.3, 3.4), vec3f(2.3, 3.2, 3.4))).toEqual(
      vec3b(false, false, true),
    );
    expect(eq(vec4f(0.1, -0.2, -0.3, 0.4), vec4f(0.1, 0.2, 0.3, 0.4))).toEqual(
      vec4b(true, false, false, true),
    );
  });

  it('compares boolean vectors', () => {
    expect(eq(vec2b(false, false), vec2b(false, true))).toEqual(
      vec2b(true, false),
    );
    expect(eq(vec3b(true, true, true), vec3b(false, false, true))).toEqual(
      vec3b(false, false, true),
    );
    expect(
      eq(vec4b(false, true, false, true), vec4b(false, false, true, true)),
    ).toEqual(vec4b(true, false, false, true));
  });
});
