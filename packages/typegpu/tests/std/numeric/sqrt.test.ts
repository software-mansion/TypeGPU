import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';

describe('sqrt', () => {
  it('computes square roots of scalars and float vectors', () => {
    expect(std.sqrt(4)).toBe(2);
    expect(std.sqrt(d.vec2f(4, 9))).toStrictEqual(d.vec2f(2, 3));
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => std.sqrt(d.vec2i(1, 2))).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected one of 'number, vec2f, vec3f, vec4f, vec2h, vec3h, vec4h', got 'vec2i']`,
    );
  });
});
