import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';

describe('fma', () => {
  it('computes e1 * e2 + e3 for scalars', () => {
    expect(std.fma(2, 3, 4)).toBe(10);
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => std.fma(2, d.vec2f(), 3)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'number, vec2f']`,
    );
  });
});
