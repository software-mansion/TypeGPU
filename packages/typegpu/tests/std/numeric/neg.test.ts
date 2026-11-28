import { describe, expect, expectTypeOf, it } from 'vitest';
import { d, std } from 'typegpu';

describe('neg', () => {
  it('negates signed vectors', () => {
    expect(std.neg(d.vec2i(1, 2))).toEqual(d.vec2i(-1, -2));
    expect(std.neg(d.vec2f(1, 2))).toEqual(d.vec2f(-1, -2));
  });

  it('has correct return type', () => {
    expectTypeOf(std.neg(1)).toEqualTypeOf<number>();
    expectTypeOf(std.neg(d.vec3f())).toEqualTypeOf<d.v3f>();
    expectTypeOf(std.neg(d.vec2i())).toEqualTypeOf<d.v2i>();
  });

  it('accepts union', () => {
    const vecOrNum = d.vec3f(1, -2, 3) as number | d.v3f;
    expectTypeOf(std.neg(vecOrNum)).toEqualTypeOf<number | d.v3f>();
    expect(std.neg(vecOrNum)).toStrictEqual(d.vec3f(-1, 2, -3));
  });

  it('rejects unsigned vectors in unions', () => {
    // @ts-expect-error
    () => std.neg(d.vec3u() as number | d.v3u);
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => std.neg(d.vec2u(1, 2))).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected one of 'number, vec2i, vec3i, vec4i, vec2f, vec3f, vec4f, vec2h, vec3h, vec4h', got 'vec2u'.]`,
    );
  });
});
