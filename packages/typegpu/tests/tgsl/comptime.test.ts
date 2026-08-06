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

  it('receives comptime-known matrix columns as an array of vectors', () => {
    const inspect = tgpu.comptime((columns: readonly d.v2f[]) => {
      return tgpu['~unstable'].rawCodeSnippet(
        `// isArray=${Array.isArray(columns)} value=${JSON.stringify(columns)}`,
        d.Void,
      );
    });
    const external = d.mat2x2f(1, 2, 3, 4);

    function main() {
      'use gpu';
      inspect(d.mat2x2f(5, 6, 7, 8).columns).$;
      inspect(external.columns).$;
    }

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        // isArray=true value=[[5,6],[7,8]];
        // isArray=true value=[[1,2],[3,4]];
      }"
    `);
  });

  it('throws when runtime-known matrix columns are passed in', () => {
    const count = tgpu.comptime((columns: readonly d.v2f[]) => columns.length);

    function main() {
      'use gpu';
      const m = d.mat2x2f();
      return count(m.columns);
    }

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main()
      - fn:count: Called comptime function with runtime-known values: 'm.columns']
    `);
  });

  it('receives infix operators on comptime-known values as bound functions', () => {
    const apply = tgpu.comptime((op: (rhs: number) => d.v3f) => op(2));
    const external = d.vec3f(4, 5, 6);

    function main() {
      'use gpu';
      return apply(d.vec3f(1, 2, 3).mul).add(apply(external.add));
    }

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> vec3f {
        return vec3f(8, 11, 14);
      }"
    `);
  });

  it('throws when infix operators on runtime-known values are passed in', () => {
    const apply = tgpu.comptime((op: (rhs: number) => d.v3f) => op(2));

    function main() {
      'use gpu';
      const v = d.vec3f(1, 2, 3);
      return apply(v.mul);
    }

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main()
      - fn:apply: Called comptime function with runtime-known values: 'v.mul']
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
