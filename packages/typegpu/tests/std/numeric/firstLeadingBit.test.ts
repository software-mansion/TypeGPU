import { describe, expect, it, vi } from 'vitest';
import { tgpu, d, std } from 'typegpu';

describe('firstLeadingBit', () => {
  it('accepts concrete and abstract integers', () => {
    const main = () => {
      'use gpu';
      const a = d.u32(8);
      const b = d.vec3i(1, 2, 3);
      return std.firstLeadingBit(5) + std.firstLeadingBit(b).x + d.i32(std.firstLeadingBit(a));
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> i32 {
        const a = 8u;
        let b = vec3i(1, 2, 3);
        return ((firstLeadingBit(5i) + firstLeadingBit(b).x) + i32(firstLeadingBit(a)));
      }"
    `);
  });

  it('converts float scalars to i32, like other integer bit functions', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const main = () => {
      'use gpu';
      const x = d.f32(1.5);
      return std.firstLeadingBit(x);
    };

    expect(tgpu.resolve([main])).toContain('return firstLeadingBit(i32(x));');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('implicit-conversion'),
      expect.anything(),
    );
    warn.mockRestore();
  });

  it('rejects float vectors', () => {
    const main = () => {
      'use gpu';
      const a = d.vec3f(1, 2, 3);
      // @ts-expect-error
      return std.firstLeadingBit(a);
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main()
      - fn:firstLeadingBit: Unsupported data types: vec3f. Supported types are: i32, u32, vec2i, vec3i, vec4i, vec2u, vec3u, vec4u.]
    `);
  });
});
