/**
 * @vitest-environment jsdom
 */

import { describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { d, std, tgpu } from 'typegpu';

describe('abstract numeric casts', () => {
  it('generates a valid u32 bitwise operation', () => {
    const seedSaltZ = 0xbca0294b | 0;
    const main = tgpu.fn(() => {
      'use gpu';
      const x = d.u32();
      return x ^ seedSaltZ;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> u32 {
        const x = 0u;
        return (x ^ 3164612939u);
      }"
    `);
  });

  it('casts negative integer arguments to u32', () => {
    const fn = tgpu.fn(
      [d.u32],
      d.u32,
    )((x) => {
      'use gpu';
      return x;
    });

    const main = () => {
      'use gpu';
      return fn(-1);
    };

    expect(main()).toMatchInlineSnapshot(`4294967295`);
    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn fn_1(x: u32) -> u32 {
        return x;
      }

      fn main() -> u32 {
        return fn_1(4294967295u);
      }"
    `);
  });

  it('casts negative integer arguments to u32 in std library function', () => {
    const main = () => {
      'use gpu';
      const a = d.u32(1);
      return std.min(a, -1);
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> u32 {
        const a = 1u;
        return min(a, 4294967295u);
      }"
    `);
  });

  it('casts negative struct field values to u32', () => {
    const Schema = d.struct({ p: d.u32 });

    const main = () => {
      'use gpu';
      const s = Schema({ p: -1 });
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "struct Schema {
        p: u32,
      }

      fn main() {
        let s = Schema(4294967295u);
      }"
    `);
  });

  it('cast large abstract int exceeding i32 range', () => {
    const main = () => {
      'use gpu';
      const a = d.i32(1);
      const b = std.min(a, 500000000000000000);
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        const a = 1i;
        let b = min(a, -743309312i);
      }"
    `);
  });

  it('should warn about implicit abstract conversions', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fn = () => {
      'use gpu';
      const a = d.u32(1);
      return std.max(a, -1);
    };

    expect(fn()).toMatchInlineSnapshot(`1`);
    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() -> u32 {
        const a = 1u;
        return max(a, 4294967295u);
      }"
    `);
    expect(consoleWarnSpy.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "⚠️ [implicit-conversion] ",
        "Implicit abstract conversion from -1: abstractInt to u32 changes the value to 4294967295. Use an explicit conversion if this behavior is intended.",
      ]
    `);
  });

  it('should warn about implicit abstract conversions in conditional expressions', ({ root }) => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const buf = root.createUniform(d.u32, 1);
    const fn = () => {
      'use gpu';
      if (buf.$ > -1) {
        return true;
      }
      return false;
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> buf: u32;

      fn fn_1() -> bool {
        if ((buf > 4294967295u)) {
          return true;
        }
        return false;
      }"
    `);
    expect(consoleWarnSpy.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "⚠️ [implicit-conversion] ",
        "Implicit abstract conversion from -1: abstractInt to u32 changes the value to 4294967295. Use an explicit conversion if this behavior is intended.",
      ]
    `);
  });

  it('should warn about multiple implicit abstract conversions', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fn = () => {
      'use gpu';
      const x = [-1, -2, d.u32(3)];
      return x;
    };

    expect(fn()).toMatchInlineSnapshot(`
      [
        -1,
        -2,
        3,
      ]
    `);
    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() -> array<u32, 3> {
        let x = array<u32, 3>(4294967295u, 4294967294u, 3u);
        return x;
      }"
    `);
    expect(consoleWarnSpy.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "⚠️ [implicit-conversion] ",
          "Implicit abstract conversion from -1: abstractInt to u32 changes the value to 4294967295. Use an explicit conversion if this behavior is intended.",
        ],
        [
          "⚠️ [implicit-conversion] ",
          "Implicit abstract conversion from -2: abstractInt to u32 changes the value to 4294967294. Use an explicit conversion if this behavior is intended.",
        ],
      ]
    `);
  });

  it('should not warn about implicit abstract conversions in vector constructor', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fn = () => {
      'use gpu';
      const x = d.vec3u(-1, -2, 3);
      return x;
    };

    expect(fn()).toMatchInlineSnapshot(`
      Vec3uImpl [
        4294967295,
        4294967294,
        3,
      ]
    `);

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() -> vec3u {
        let x = vec3u(4294967295, 4294967294, 3);
        return x;
      }"
    `);

    expect(consoleWarnSpy.mock.calls).toHaveLength(0);
  });
});
