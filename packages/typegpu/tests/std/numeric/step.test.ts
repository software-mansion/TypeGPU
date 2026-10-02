import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';

describe('step', () => {
  it('compares scalars', () => {
    expect(std.step(2, 3)).toBe(1);
    expect(std.step(2, 2)).toBe(1);
    expect(std.step(2, 1)).toBe(0);
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => std.step(2, d.vec2f())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'number, vec2f'.]`,
    );
  });
});
