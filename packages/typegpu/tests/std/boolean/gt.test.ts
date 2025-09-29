import { describe, expect, it } from 'vitest';
import * as d from '../../../src/data/index.ts';
import { gt } from '../../../src/std/index.ts';

describe('gt', () => {
  it('compares numbers', () => {
    expect(gt(1, 0)).toStrictEqual(true);
    expect(gt(1, 1)).toStrictEqual(false);
    expect(gt(0, 1)).toStrictEqual(false);
  });

  it('compares integer vectors', () => {
    expect(gt(d.vec2i(1, -1), d.vec2i(0, 0))).toStrictEqual(
      d.vec2b(true, false),
    );
    expect(gt(d.vec3i(20, 20, 20), d.vec3i(10, 20, 30))).toStrictEqual(
      d.vec3b(true, false, false),
    );
    expect(gt(d.vec4i(1, 2, 3, 4), d.vec4i(4, 2, 3, 1))).toStrictEqual(
      d.vec4b(false, false, false, true),
    );
  });

  it('compares float vectors', () => {
    expect(gt(d.vec2f(0.1, 2.1), d.vec2f(0.1, 2))).toStrictEqual(
      d.vec2b(false, true),
    );
    expect(gt(d.vec3f(1.2, 3.3, 3.4), d.vec3f(2.3, 3.2, 3.4))).toStrictEqual(
      d.vec3b(false, true, false),
    );
    expect(
      gt(d.vec4f(1.1, -1.2, -0.3, 0.4), d.vec4f(0.1, 0.2, 0.3, 0.4)),
    ).toStrictEqual(d.vec4b(true, false, false, false));
  });

  it('accepts unions', () => {
    const a = 1 as number | d.v3f;
    const b = 0 as number | d.v3f;
    expect(gt(a, b)).toStrictEqual(true);
  });
});
