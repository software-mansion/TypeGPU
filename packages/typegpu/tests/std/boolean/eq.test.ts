import { describe, expect, it } from 'vitest';
import * as d from '../../../src/data/index.ts';
import { eq } from '../../../src/std/index.ts';

describe('eq', () => {
  it('compares numbers', () => {
    expect(eq(10, 10)).toStrictEqual(true);
    expect(eq(1, 0)).toStrictEqual(false);
    expect(eq(10, 20)).toStrictEqual(false);
  });

  it('compares integer vectors', () => {
    expect(eq(d.vec2u(1, 0), d.vec2u(0, 0))).toStrictEqual(
      d.vec2b(false, true),
    );
    expect(eq(d.vec3u(10, 20, 40), d.vec3u(10, 20, 30))).toStrictEqual(
      d.vec3b(true, true, false),
    );
    expect(eq(d.vec4u(1, 2, 3, 4), d.vec4u(4, 2, 3, 1))).toStrictEqual(
      d.vec4b(false, true, true, false),
    );
  });

  it('compares float vectors', () => {
    expect(eq(d.vec2f(0.1, 1.1), d.vec2f(0.1, 0))).toStrictEqual(
      d.vec2b(true, false),
    );
    expect(eq(d.vec3f(1.2, 2.3, 3.4), d.vec3f(2.3, 3.2, 3.4))).toStrictEqual(
      d.vec3b(false, false, true),
    );
    expect(
      eq(d.vec4f(0.1, -0.2, -0.3, 0.4), d.vec4f(0.1, 0.2, 0.3, 0.4)),
    ).toStrictEqual(d.vec4b(true, false, false, true));
  });

  it('compares boolean vectors', () => {
    expect(eq(d.vec2b(false, false), d.vec2b(false, true))).toStrictEqual(
      d.vec2b(true, false),
    );
    expect(
      eq(d.vec3b(true, true, true), d.vec3b(false, false, true)),
    ).toStrictEqual(d.vec3b(false, false, true));
    expect(
      eq(d.vec4b(false, true, false, true), d.vec4b(false, false, true, true)),
    ).toStrictEqual(d.vec4b(true, false, false, true));
  });

  it('accepts unions', () => {
    const a = 1 as number | d.v3f;
    const b = 0 as number | d.v3f;
    expect(eq(a, b)).toStrictEqual(false);
  });
});
