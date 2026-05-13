import { it } from 'typegpu-testing-utility';
import { describe, expect } from 'vitest';
import tgpu, { d, std } from '../../src/index.js';

describe('std.copy', () => {
  describe('on the CPU', () => {
    it('copies booleans', () => {
      expect(std.copy(true)).toBe(true);
      expect(std.copy(false)).toBe(false);
    });

    it('copies numerics', () => {
      expect(std.copy(1)).toBe(1);
      expect(std.copy(1.5)).toBe(1.5);
      expect(std.copy(-0)).toBe(-0);
    });

    it('copies vectors', () => {
      const vec = d.vec2u(1, 2);
      const copy = std.copy(vec);

      expect(copy).toStrictEqual(vec);
      expect(copy).not.toBe(vec);
    });

    it('copies matrices', () => {
      const mat = d.mat2x2f(1, 2, 3, 4);
      const copy = std.copy(mat);

      expect(copy).toStrictEqual(mat);
      expect(copy).not.toBe(mat);
    });

    it('copies structs', () => {
      const Boid = d.struct({ prop: d.vec2u });
      const boid = Boid({ prop: d.vec2u(1, 2) });
      const copy = std.copy(boid);

      expect(copy).toStrictEqual(boid);
      expect(copy).not.toBe(boid);
    });

    it('copies arrays', () => {
      const arr = [1, 2, 3];
      const copy = std.copy(arr);

      expect(copy).toStrictEqual(arr);
      expect(copy).not.toBe(arr);
    });

    it('deeply copies nested structs', () => {
      const Inner = d.struct({ pos: d.vec2u });
      const Outer = d.struct({ inner: Inner });
      const struct = Outer({ inner: Inner({ pos: d.vec2u(1, 2) }) });
      const copy = std.copy(struct);

      expect(copy).toStrictEqual(struct);
      expect(copy).not.toBe(struct);
      expect(copy.inner).not.toBe(struct.inner);
      expect(copy.inner.pos).not.toBe(struct.inner.pos);
    });

    it('deeply copies nested arrays', () => {
      const arr = [[d.vec2u(1, 2)]] as const;
      const copy = std.copy(arr);

      expect(copy).toStrictEqual(arr);
      expect(copy).not.toBe(arr);
      expect(copy[0]).not.toBe(arr[0]);
      expect(copy[0][0]).not.toBe(arr[0][0]);
    });
  });

  describe('on the GPU', () => {
    it('works for naturally ephemeral variables', () => {
      const fn = () => {
        'use gpu';
        const a = 1;
        const b = std.copy(a);
      };

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() {
          const a = 1;
          let b = a;
        }"
      `);
    });

    it('works for referential variables', () => {
      const fn = () => {
        'use gpu';
        const a = d.vec2u(1, 2);
        const b = std.copy(a);
      };

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() {
          var a = vec2u(1, 2);
          var b = a;
        }"
      `);
    });

    it('works for arguments', () => {
      const fn = tgpu.fn([d.vec2u])((a) => {
        'use gpu';
        const b = std.copy(a);
        b.x++;
      });

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1(a: vec2u) {
          var b = a;
          b.x++;
        }"
      `);
    });

    it('works for structs', () => {
      const Boid = d.struct({ pos: d.vec2u });

      const fn = () => {
        'use gpu';
        const boid = Boid({ pos: d.vec2u(1, 2) });
        const copy = std.copy(boid);
      };

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "struct Boid {
          pos: vec2u,
        }

        fn fn_1() {
          var boid = Boid(vec2u(1, 2));
          var copy = boid;
        }"
      `);
    });

    it('works for arrays', () => {
      const fn = () => {
        'use gpu';
        const arr = [1, 2, 3];
        const copy = std.copy(arr);
      };

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() {
          var arr = array<i32, 3>(1, 2, 3);
          var copy = arr;
        }"
      `);
    });

    it('can be used to copy a buffer', ({ root }) => {
      const uniform = root.createUniform(d.vec2u, [1, 2]);

      const fn = () => {
        'use gpu';
        const v = std.copy(uniform.$);
      };

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "@group(0) @binding(0) var<uniform> uniform_1: vec2u;

        fn fn_1() {
          var v = uniform_1;
        }"
      `);
    });

    it('works for nested structs', () => {
      const Inner = d.struct({ pos: d.vec2u });
      const Outer = d.struct({ inner: Inner, count: d.u32 });

      const fn = () => {
        'use gpu';
        const struct = Outer({ inner: Inner({ pos: d.vec2u(1, 2) }), count: 3 });
        const copy = std.copy(struct);
      };

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "struct Inner {
          pos: vec2u,
        }

        struct Outer {
          inner: Inner,
          count: u32,
        }

        fn fn_1() {
          var struct_1 = Outer(Inner(vec2u(1, 2)), 3u);
          var copy = struct_1;
        }"
      `);
    });

    it('works for struct prop access', () => {
      const Boid = d.struct({ pos: d.vec2u });

      const fn = () => {
        'use gpu';
        const boid = Boid({ pos: d.vec2u(1, 2) });
        const prop = std.copy(boid.pos);
      };

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "struct Boid {
          pos: vec2u,
        }

        fn fn_1() {
          var boid = Boid(vec2u(1, 2));
          var prop = boid.pos;
        }"
      `);
    });

    it('works for array element access', () => {
      const fn = () => {
        'use gpu';
        const arr = [1, 2, 3];
        const elem = std.copy(arr[0]);
      };

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() {
          var arr = array<i32, 3>(1, 2, 3);
          let elem = arr[0i];
        }"
      `);
    });

    it('produces a mutable result for const', () => {
      const v = tgpu.const(d.vec2u, d.vec2u(1, 2));

      const fn = () => {
        'use gpu';
        const a = std.copy(v.$);
        a.x = 3;
      };

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "const v: vec2u = vec2u(1, 2);

        fn fn_1() {
          var a = v;
          a.x = 3u;
        }"
      `);
    });

    it('works for overloaded functions', () => {
      const Boid = d.struct({ prop: d.vec2u });

      const fn = <T extends number | d.v2u | d.Infer<typeof Boid>>(arg: T): T => {
        'use gpu';
        const copy = std.copy(arg);
        return copy;
      };

      const main = () => {
        'use gpu';
        const a = fn(1);
        const b = fn(d.vec2u());
        const c = fn(Boid({ prop: d.vec2u() }));
      };

      expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
        "fn fn_1(arg: i32) -> i32 {
          let copy = arg;
          return copy;
        }

        fn fn_2(arg: vec2u) -> vec2u {
          var copy = arg;
          return copy;
        }

        struct Boid {
          prop: vec2u,
        }

        fn fn_3(arg: Boid) -> Boid {
          var copy = arg;
          return copy;
        }

        fn main() {
          let a = fn_1(1i);
          var b = fn_2(vec2u());
          var c = fn_3(Boid(vec2u()));
        }"
      `);
    });

    it('cannot be used in d.ref', () => {
      const modify = (v: d.ref<d.v2u>) => {
        'use gpu';
        v.$.x++;
      };

      const fn = () => {
        'use gpu';
        const a = d.vec2u(1, 2);
        const b = modify(d.ref(std.copy(a)));
      };

      expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn*:fn
        - fn*:fn(): d.ref() created with primitive types must be stored in a variable before use]
      `);
    });
  });
});
