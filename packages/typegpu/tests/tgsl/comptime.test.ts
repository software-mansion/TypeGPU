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

  it('receives array expressions as plain arrays', () => {
    const inspect = tgpu.comptime((arr: unknown[]) => {
      return tgpu['~unstable'].rawCodeSnippet(
        `// isArray=${Array.isArray(arr)} value=${JSON.stringify(arr)}`,
        d.Void,
      );
    });

    function main() {
      'use gpu';
      inspect([1, 2, 3]).$;
    }

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        // isArray=true value=[1,2,3];
      }"
    `);
  });

  it('receives nested array expressions with comptime-known elements', () => {
    const offset = 5;
    const sum = tgpu.comptime((arr: number[][]) => arr.flat().reduce((a, b) => a + b, 0));

    function main() {
      'use gpu';
      return sum([
        [1, 2],
        [offset, d.u32(4)],
      ]);
    }

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> i32 {
        return 12;
      }"
    `);
  });

  it('throws when an array expression contains runtime-known elements', () => {
    const sum = tgpu.comptime((arr: number[]) => arr.reduce((a, b) => a + b, 0));

    function main() {
      'use gpu';
      const a = d.f32(1);
      return sum([a, 2]);
    }

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main()
      - fn:sum: Called comptime function with runtime-known values: '[a, 2]']
    `);
  });

  it('throws when called with runtime-known values', () => {
    const double = tgpu.comptime((v: number) => v * 2);

    function main() {
      'use gpu';
      const a = d.f32(1);
      return double(a * 2);
    }

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main()
      - fn:double: Called comptime function with runtime-known values: 'a * 2']
    `);
  });
});
