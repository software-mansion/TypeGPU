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

  it('receives array literals as arrays', () => {
    const inspect = tgpu.comptime((arr: unknown) => {
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

  it('receives nested array literals as nested arrays', () => {
    const inspect = tgpu.comptime((arr: unknown) => {
      return tgpu['~unstable'].rawCodeSnippet(`// value=${JSON.stringify(arr)}`, d.Void);
    });

    function main() {
      'use gpu';
      inspect([
        [1, 2],
        [3, 4],
      ]).$;
    }

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        // value=[[1,2],[3,4]];
      }"
    `);
  });

  it('rejects array literals holding runtime values', () => {
    const inspect = tgpu.comptime((arr: unknown) => {
      return tgpu['~unstable'].rawCodeSnippet(`// ${JSON.stringify(arr)}`, d.Void);
    });

    const myFn = tgpu.fn([d.f32])((x) => {
      inspect([1, x]).$;
    });

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn
      - fn:inspect: Called comptime function with runtime-known values: 'x']
    `);
  });
});
