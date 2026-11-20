import { describe, expect, it } from 'vitest';
import { d } from 'typegpu';
import { snip } from 'typegpu/~internal';

describe('snip', () => {
  it('throws when nesting snippets', () => {
    const inner = snip('a', d.f32, 'runtime');

    expect(() => snip(inner, d.f32, 'runtime')).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot nest snippets]`,
    );
  });
});
