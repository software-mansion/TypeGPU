import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { parse, parseResolved } from './utils/parseResolved.ts';

describe('tgpu.fn function with arguments passed in a record', () => {
  it('allows accessing arguments through object access in implementation', () => {
    const add = tgpu['~unstable'].fn(
      { a: d.u32, b: d.u32 },
      d.u32,
    )((args) => {
      return args.a + args.b;
    });

    expect(parseResolved({ add })).toBe(
      parse(`
        fn add(a: u32, b: u32) -> u32 {
          return (a + b);
        }
    `),
    );
  });

  it('allows destructuring arguments in implementation', () => {
    const add = tgpu['~unstable'].fn(
      { a: d.u32, b: d.u32 },
      d.u32,
    )(({ a, b }) => {
      return a + b;
    });

    expect(parseResolved({ add })).toBe(
      parse(`
        fn add(a: u32, b: u32) -> u32 {
          return (a + b);
        }
    `),
    );
  });

  it('allows using only subset of arguments', () => {
    const add = tgpu['~unstable'].fn(
      { a: d.u32, b: d.u32, c: d.u32 },
      d.u32,
    )(({ a, b }) => {
      return a + b;
    });

    expect(parseResolved({ add })).toBe(
      parse(`
        fn add(a: u32, b: u32, c: u32) -> u32 {
          return (a + b);
        }
    `),
    );
  });

  it('allows aliasing arguments in implementation', () => {
    const add = tgpu['~unstable'].fn(
      { a: d.u32, b: d.u32 },
      d.u32,
    )(({ a: aa, b: bb }) => {
      return aa + bb;
    });

    expect(parseResolved({ add })).toBe(
      parse(`
        fn add(a: u32, b: u32) -> u32 {
          return (a + b);
        }
    `),
    );
  });

  it('requires passing arguments in an object when calling the function in TGSL', () => {
    const add = tgpu['~unstable'].fn(
      { a: d.u32, b: d.u32 },
      d.u32,
    )((args) => {
      return args.a + args.b;
    });

    const f = tgpu['~unstable'].fn({})(() => {
      const x = add({ a: 2, b: 3 });
    });

    expect(parseResolved({ f })).toBe(
      parse(`
        fn add(a: u32, b: u32) -> u32 {
          return (a + b);
        }

        fn f() {
          var x = add(2, 3);
        }
    `),
    );
  });

  it('does not require passing arguments in an object when calling the function in raw fns', () => {
    const add = tgpu['~unstable'].fn(
      { a: d.u32, b: d.u32 },
      d.u32,
    )((args) => {
      return args.a + args.b;
    });

    const f = tgpu['~unstable']
      .fn({})(`{
        var x = add(2, 3);
      }`)
      .$uses({ add });

    expect(parseResolved({ f })).toBe(
      parse(`
        fn add(a: u32, b: u32) -> u32 {
          return (a + b);
        }

        fn f() {
          var x = add(2, 3);
        }
    `),
    );
  });

  it('automatically adds struct definitions of argument types when resolving TGSL record argTypes functions', () => {
    const Point = d
      .struct({
        a: d.u32,
        b: d.u32,
      })
      .$name('Point');

    const func = tgpu['~unstable']
      .fn(
        { a: d.vec4f, b: Point },
        undefined,
      )(({ b }) => {
        const newPoint = b;
      })
      .$name('newPointF');

    expect(parseResolved({ func })).toBe(
      parse(`
      struct Point {
        a: u32,
        b: u32,
      }

      fn newPointF(a: vec4f, b: Point) {
        var newPoint = b;
      }`),
    );
  });
});
