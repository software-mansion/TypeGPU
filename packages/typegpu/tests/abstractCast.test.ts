/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
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
    const fn = tgpu.fn([d.u32])(() => {
      'use gpu';
    });

    const main = () => {
      'use gpu';
      fn(-1);
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn fn_1(_arg_0: u32) {}

      fn main() {
        fn_1(4294967295u);
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
});
