import { describe, expect, it } from 'vitest';
import { d, tgpu } from 'typegpu';

describe('d.sizeOf', () => {
  it('can be called at comptime in a shader function', () => {
    const Header = d.struct({ count: d.u32, position: d.vec3f });

    const next = tgpu.fn(
      [d.u32],
      d.u32,
    )((offset) => {
      'use gpu';
      return offset + d.sizeOf(Header);
    });

    expect(tgpu.resolve([next])).toMatchInlineSnapshot(`
      "fn next(offset: u32) -> u32 {
        return (offset + 32u);
      }"
    `);
  });

  it('ignores @size on a schema that is not a struct member', () => {
    const Sized = d.size(32, d.u32);

    const sizeFn = tgpu.fn(
      [],
      d.u32,
    )(() => {
      'use gpu';
      return d.sizeOf(Sized);
    });

    expect(tgpu.resolve([sizeFn])).toMatchInlineSnapshot(`
      "fn sizeFn() -> u32 {
        return 4u;
      }"
    `);
  });
});
