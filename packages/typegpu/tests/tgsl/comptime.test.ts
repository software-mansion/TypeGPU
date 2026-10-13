import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu, d } from 'typegpu';

describe('comptime', () => {
  it('should work in JS', () => {
    const myComptime = tgpu.comptime(() => 0.5);

    const myFn = tgpu.fn(
      [],
      d.f32,
    )(() => {
      return myComptime();
    });

    expect(myFn()).toBe(0.5);
  });

  it('should work when returning a constant', () => {
    const myComptime = tgpu.comptime(() => 0.5);

    const myFn = tgpu.fn(
      [],
      d.f32,
    )(() => {
      return myComptime();
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() -> f32 {
        return 0.5f;
      }"
    `);
  });

  it('should work when returning a reference', () => {
    let a = 0;
    const myComptime = tgpu.comptime(() => a);
    const myFn = tgpu.fn(
      [],
      d.f32,
    )(() => {
      return myComptime();
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() -> f32 {
        return 0f;
      }"
    `);

    a = 1;
    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() -> f32 {
        return 1f;
      }"
    `);
  });

  it('should work in "normal" mode', () => {
    const stagger = tgpu.comptime((v: d.v3f) => {
      return v.add(d.vec3f(0, 1, 2));
    });

    const myFn = tgpu.fn(
      [],
      d.f32,
    )(() => {
      return stagger(d.vec3f(2)).z;
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() -> f32 {
        return 4f;
      }"
    `);
  });

  it('can return null', () => {
    const comptime = tgpu.comptime(() => null);
    const myFn = () => {
      'use gpu';
      return comptime() !== null ? 0 : 1;
    };

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() -> i32 {
        return 1;
      }"
    `);
  });
});

describe('compile-time evaluation of numeric operations', () => {
  it('rounds f32 results to f32 precision', () => {
    const main = tgpu.fn(
      [],
      d.f32,
    )(() => {
      return d.f32(16777216) + d.f32(1);
    });

    // 16777217 is not representable in f32
    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> f32 {
        return 16777216f;
      }"
    `);
  });

  it('prints rounded f32 results with the shortest literal', () => {
    const main = tgpu.fn(
      [],
      d.f32,
    )(() => {
      return d.f32(0.1) + d.f32(0.2);
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> f32 {
        return 0.3f;
      }"
    `);
  });

  it('makes compile-time comparisons agree with f32 math', () => {
    const main = tgpu.fn(
      [],
      d.u32,
    )(() => {
      if (d.f32(16777216) + d.f32(1) === d.f32(16777216)) {
        return 1;
      }
      return 0;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> u32 {
        return 1u;
      }"
    `);
  });

  it('throws on u32 overflow', () => {
    const main = tgpu.fn(
      [],
      d.u32,
    )(() => {
      return d.u32(4000000000) + d.u32(1000000000);
    });

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:main: The result of 'add' evaluated at compile time (5000000000) does not fit in u32. WGSL treats overflow in constant expressions as an error.]
    `);
  });

  it('throws on i32 overflow', () => {
    const main = tgpu.fn(
      [],
      d.i32,
    )(() => {
      return d.i32(2147483647) + d.i32(1);
    });

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:main: The result of 'add' evaluated at compile time (2147483648) does not fit in i32. WGSL treats overflow in constant expressions as an error.]
    `);
  });

  it('allows results at the edges of the integer ranges', () => {
    const main = tgpu.fn(
      [],
      d.i32,
    )(() => {
      return d.i32(2147483646) + d.i32(1);
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> i32 {
        return 2147483647i;
      }"
    `);
  });
});
