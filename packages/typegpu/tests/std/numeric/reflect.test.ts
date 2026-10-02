import { describe, expect, it } from 'vitest';
import { vec2f, vec3f } from 'typegpu/data';
import { reflect } from 'typegpu/std';

describe('reflect', () => {
  it('reflects a vec2f vector correctly', () => {
    const I = vec2f(1, -1);
    const N = vec2f(0, 1);
    expect(reflect(I, N)).toStrictEqual(vec2f(1, 1));
  });

  it('reflects a vec3f vector correctly', () => {
    const I = vec3f(1, -1, 0);
    const N = vec3f(0, 1, 0);
    expect(reflect(I, N)).toStrictEqual(vec3f(1, 1, 0));
  });

  it('reflects a vec2f vector with no angle change when incident angle is zero', () => {
    const I = vec2f(3, 4);
    const N = vec2f(0, 1);
    expect(reflect(I, N)).toStrictEqual(vec2f(3, -4));
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => reflect(vec2f(), vec3f())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'vec2f, vec3f'.]`,
    );
    // @ts-expect-error
    expect(() => reflect(1, 2)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected kind to not be scalar, got 'number'.]`,
    );
  });
});
