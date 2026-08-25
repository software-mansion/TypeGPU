import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';

describe('neg', () => {
  it('negates signed vectors', () => {
    expect(std.neg(d.vec2i(1, 2))).toEqual(d.vec2i(-1, -2));
    expect(std.neg(d.vec2f(1, 2))).toEqual(d.vec2f(-1, -2));
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => std.neg(d.vec2u(1, 2))).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected one of 'number, vec2i, vec3i, vec4i, vec2f, vec3f, vec4f, vec2h, vec3h, vec4h', got 'vec2u'.]`,
    );
  });
});
