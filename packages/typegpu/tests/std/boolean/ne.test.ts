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
} from '../../../src/data/index.ts';
import { ne } from '../../../src/std/index.ts';

describe('ne', () => {
  it('compares integer vectors', () => {
    expect(ne(vec2u(1, 0), vec2u(0, 0))).toStrictEqual(vec2b(true, false));
    expect(ne(vec3u(10, 20, 40), vec3u(10, 20, 30))).toStrictEqual(vec3b(false, false, true));
    expect(ne(vec4u(1, 2, 3, 4), vec4u(4, 2, 3, 1))).toStrictEqual(vec4b(true, false, false, true));
  });

  it('compares float vectors', () => {
    expect(ne(vec2f(0.1, 1.1), vec2f(0.1, 0))).toStrictEqual(vec2b(false, true));
    expect(ne(vec3f(1.2, 2.3, 3.4), vec3f(2.3, 3.2, 3.4))).toStrictEqual(vec3b(true, true, false));
    expect(ne(vec4f(0.1, -0.2, -0.3, 0.4), vec4f(0.1, 0.2, 0.3, 0.4))).toStrictEqual(
      vec4b(false, true, true, false),
    );
  });

  it('compares boolean vectors', () => {
    expect(ne(vec2b(true, true), vec2b(true, false))).toStrictEqual(vec2b(false, true));
    expect(ne(vec3b(false, false, false), vec3b(true, true, false))).toStrictEqual(
      vec3b(true, true, false),
    );
    expect(ne(vec4b(true, false, true, false), vec4b(true, true, false, false))).toStrictEqual(
      vec4b(false, true, true, false),
    );
  });
});
