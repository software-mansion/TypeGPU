import { describe, expect } from 'vitest';
import tgpu from '../../src/index.ts';
import * as d from '../../src/data/index.ts';
import * as std from '../../src/std/index.ts';
import { it } from '../utils/extendedIt.ts';
import { asWgsl } from '../utils/parseResolved.ts';

describe('shellless', () => {
  it('is callable from shelled function', () => {
    const dot2 = (a: d.v2f) => {
      'kernel';
      return std.dot(a, a);
    };

    const foo = () => {
      'kernel';
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
      'kernel';
      return std.dot(a, a);
    };

    const foo = () => {
      'kernel';
      return dot2(d.vec2f(1, 2)) + dot2(d.vec3f(3, 4, 5));
    };

    const main = tgpu.fn([], d.f32)(() => {
      return foo();
    });

    expect(asWgsl(main)).toMatchInlineSnapshot(`
      "fn dot2(a: vec2f) -> f32 {
        return dot(a, a);
      }

      fn dot2_1(a: vec3f) -> f32 {
        return dot(a, a);
      }

      fn foo() -> f32 {
        return (dot2(vec2f(1, 2)) + dot2_1(vec3f(3, 4, 5)));
      }

      fn main() -> f32 {
        return foo();
      }"
    `);
  });

  it('handles fully abstract cases', () => {
    const someFn = (a: number, b: number) => {
      'kernel';
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
      'kernel';
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
      'kernel';
      return 4.1;
    };

    const fn2 = () => {
      'kernel';
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

  it('generates pointer type to handle references', () => {
    const advance = (pos: d.v3f, vel: d.v3f) => {
      'kernel';
      pos.x += vel.x;
      pos.y += vel.y;
      pos.z += vel.z;
    };

    const main = tgpu.fn([])(() => {
      const pos = d.vec3f(0, 0, 0);
      advance(pos, d.vec3f(1, 2, 3));
    });

    expect(asWgsl(main)).toMatchInlineSnapshot(`
      "fn advance(pos: ptr<function, vec3f>, vel: vec3f) {
        (*pos).x += vel.x;
        (*pos).y += vel.y;
        (*pos).z += vel.z;
      }

      fn main() {
        var pos = vec3f();
        advance(&pos, vec3f(1, 2, 3));
      }"
    `);
  });
});
