import { describe, expect } from 'vitest';
import tgpu from '../../src/index.ts';
import * as d from '../../src/data/index.ts';
import * as std from '../../src/std/index.ts';
import { it } from '../utils/extendedIt.ts';
import { asWgsl } from '../utils/parseResolved.ts';

describe('shellless', () => {
  it('is callable from shelled function', () => {
    const dot2 = (a: d.v2f) => {
      'use gpu';
      return std.dot(a, a);
    };

    const foo = () => {
      'use gpu';
      return dot2(d.vec2f(1, 2)) + dot2(d.vec2f(3, 4));
    };

    const main = tgpu.fn([], d.f32)(() => {
      return foo();
    });

    expect(asWgsl(main)).toMatchInlineSnapshot(`
      "fn dot2(a: vec2f) -> f32 {
        return dot(a, a);
      }

      fn foo() -> f32 {
        return (dot2(vec2f(1, 2)) + dot2(vec2f(3, 4)));
      }

      fn main() -> f32 {
        return foo();
      }"
    `);
  });

  it('is generic based on arguments', () => {
    const dot2 = (a: d.v2f | d.v3f) => {
      'use gpu';
      return std.dot(a, a);
    };

    const foo = () => {
      'use gpu';
      return dot2(d.vec2f(1, 2)) + dot2(d.vec3f(3, 4, 5));
    };

    expect(asWgsl(foo)).toMatchInlineSnapshot(`
      "fn dot2(a: vec2f) -> f32 {
        return dot(a, a);
      }

      fn dot2_1(a: vec3f) -> f32 {
        return dot(a, a);
      }

      fn foo() -> f32 {
        return (dot2(vec2f(1, 2)) + dot2_1(vec3f(3, 4, 5)));
      }"
    `);
  });

  it('handles fully abstract cases', () => {
    const someFn = (a: number, b: number) => {
      'use gpu';
      if (a > b) {
        return 12.2;
      }
      if (b > a) {
        return 2.2;
      }
      return 1;
    };

    const main = tgpu.fn(
      [],
      d.f32,
    )(() => {
      const x = someFn(1, 2);
      return x;
    });

    expect(asWgsl(main)).toMatchInlineSnapshot(`
      "fn someFn(a: i32, b: i32) -> f32 {
        if ((a > b)) {
          return 12.2;
        }
        if ((b > a)) {
          return 2.2;
        }
        return 1;
      }

      fn main() -> f32 {
        var x = someFn(1, 2);
        return x;
      }"
    `);
  });

  it('throws when no single return type can be achieved', () => {
    const someFn = (a: number, b: number) => {
      'use gpu';
      if (a > b) {
        return d.u32(12);
      }
      if (b > a) {
        return d.i32(2);
      }
      return a + b;
    };

    const main = tgpu.fn(
      [],
      d.f32,
    )(() => {
      const x = someFn(1.1, 2);
      return x;
    });

    expect(() => asWgsl(main)).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:main
      - fn*:someFn: Expected function to have a single return type, got [u32, i32, f32]. Cast explicitly to the desired type.]
    `);
  });

  it('handles nested shellless', () => {
    const fn1 = () => {
      'use gpu';
      return 4.1;
    };

    const fn2 = () => {
      'use gpu';
      return fn1();
    };

    const main = tgpu.fn([], d.f32)(() => {
      return fn2();
    });

    expect(asWgsl(main)).toMatchInlineSnapshot(`
      "fn fn1() -> f32 {
        return 4.1;
      }

      fn fn2() -> f32 {
        return fn1();
      }

      fn main() -> f32 {
        return fn2();
      }"
    `);
  });

  it('resolves when accepting no arguments', () => {
    const main = () => {
      'use gpu';
      return 4.1;
    };

    expect(asWgsl(main)).toMatchInlineSnapshot(`
      "fn main() -> f32 {
        return 4.1;
      }"
    `);
  });

  it('throws error when resolving function that expects arguments', () => {
    const main = (a: number) => {
      'use gpu';
      return a + 1;
    };

    expect(() => asWgsl(main)).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main: Cannot resolve 'main' directly, because it expects arguments. Either call it from another function, or wrap it in a shell]
    `);
  });
});
