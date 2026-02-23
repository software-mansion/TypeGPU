import { describe, expect, vi } from 'vitest';
import { it } from './utils/extendedIt.ts';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';

describe('tgpu.unroll', () => {
  it('called outside the gpu function returns passed iterable', () => {
    const arr = [1, 2, 3];
    const x = tgpu.unroll(arr);

    expect(x).toBe(arr);
  });

  it('called inside the gpu function but outside of forOf returns passed iterable', () => {
    const layout = tgpu.bindGroupLayout({
      arr: { storage: d.arrayOf(d.f32) },
    });

    const f = () => {
      'use gpu';
      const a = tgpu.unroll([1, 2, 3]);

      const v1 = d.vec2f(7);
      const v2 = tgpu.unroll(v1); // this should return a pointer
      const arr = tgpu.unroll(layout.$.arr); // this should return a pointer
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read> arr_1: array<f32>;

      fn f() {
        var a = array<i32, 3>(1, 2, 3);
        var v1 = vec2f(7);
        let v2 = (&v1);
        let arr = (&arr_1);
      }"
    `);
  });

  it('unrolls array expression of primitives', () => {
    const f = () => {
      'use gpu';
      let res = 0;
      for (const foo of tgpu.unroll([1, 2, 3])) {
        res += foo;
      }
      return res;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        var res = 0;
        {
          res += 1i;
        }
        {
          res += 2i;
        }
        {
          res += 3i;
        }
        return res;
      }"
    `);
  });

  it('unrolls correctly when loop variable is overriding', () => {
    const f = () => {
      'use gpu';
      const foo = d.vec3f(6);
      for (const foo of tgpu.unroll([1, 2])) {
        const boo = foo;
      }
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        var foo = vec3f(6);
        {
          const boo = 1;
        }
        {
          const boo = 2;
        }
      }"
    `);
  });

  it('unrolls correctly when loop variable is overridden', () => {
    const f = () => {
      'use gpu';
      let fooResult = d.f32(0);
      for (const foo of tgpu.unroll([1, 2])) {
        const boo = foo;
        {
          const foo = boo;
          fooResult += foo;
        }
        const bar = foo;
      }

      return fooResult;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> f32 {
        var fooResult = 0f;
        {
          const boo = 1;
          {
            const foo2 = boo;
            fooResult += f32(foo2);
          }
          const bar = 1;
        }
        {
          const boo = 2;
          {
            const foo2 = boo;
            fooResult += f32(foo2);
          }
          const bar = 2;
        }
        return fooResult;
      }"
    `);
  });

  it('unrolls array expression of complex types', () => {
    const Boid = d.struct({
      pos: d.vec2i,
      vel: d.vec2f,
    });

    const f = () => {
      'use gpu';
      const b1 = Boid({ pos: d.vec2i(1), vel: d.vec2f(1) });
      const b2 = Boid({ pos: d.vec2i(2), vel: d.vec2f(2) });
      let res = d.vec2f();
      for (const foo of tgpu.unroll([b1, b2])) {
        for (const boo of tgpu.unroll([Boid(), Boid()])) {
          const baz = foo;
          res = res.add(baz.vel).add(boo.vel);
        }
      }

      return res;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec2i,
        vel: vec2f,
      }

      fn f() -> vec2f {
        var b1 = Boid(vec2i(1), vec2f(1));
        var b2 = Boid(vec2i(2), vec2f(2));
        var res = vec2f();
        {
          {
            let baz = (&b1);
            res = ((res + (*baz).vel) + Boid().vel);
          }
          {
            let baz = (&b1);
            res = ((res + (*baz).vel) + Boid().vel);
          }
        }
        {
          {
            let baz = (&b2);
            res = ((res + (*baz).vel) + Boid().vel);
          }
          {
            let baz = (&b2);
            res = ((res + (*baz).vel) + Boid().vel);
          }
        }
        return res;
      }"
    `);
  });

  it('unrolls array expression of copies', () => {
    const f = () => {
      'use gpu';
      let res = d.vec2f();
      const v1 = d.vec2f(7);
      const v2 = d.vec2f(3);
      for (const foo of tgpu.unroll([d.vec2f(v1), d.vec2f(v2)])) {
        res = res.add(foo);
        const boo = foo;
        boo.x = 0;
      }

      return res;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> vec2f {
        var res = vec2f();
        var v1 = vec2f(7);
        var v2 = vec2f(3);
        {
          res = (res + v1);
          var boo = v1;
          boo.x = 0f;
        }
        {
          res = (res + v2);
          var boo = v2;
          boo.x = 0f;
        }
        return res;
      }"
    `);
  });

  it('unrolls array expression of struct field names - (simple)', () => {
    const values = { a: 1, b: 2, c: 3 };
    const list = Object.keys(values) as (keyof typeof values)[];

    const f = () => {
      'use gpu';
      let result = d.u32(0);
      for (const prop of tgpu.unroll(list)) {
        result += values[prop];
      }
      return result;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> u32 {
        var result = 0u;
        {
          result += 1u;
        }
        {
          result += 2u;
        }
        {
          result += 3u;
        }
        return result;
      }"
    `);
  });

  it('unrolls array expression of struct field names - (complex)', () => {
    const variants = {
      foo: (x: number) => {
        'use gpu';
        return 6 * x;
      },
      boo: (x: number) => {
        'use gpu';
        return 7 * x;
      },
    };

    const Weights = d.struct(Object.fromEntries(
      Object.keys(variants).map((name) => [`${name}`, d.f32]),
    ));

    const variantsKey = Object.keys(variants) as (keyof typeof variants)[];

    const computeWeight = tgpu.fn([Weights], d.f32)(
      (weights: d.Infer<typeof Weights>) => {
        'use gpu';

        let p = d.f32(0);
        for (const key of tgpu.unroll(variantsKey)) {
          // @ts-expect-error: trust me
          p += weights[key] * variants[key](p);
        }
        return p;
      },
    );

    expect(tgpu.resolve([computeWeight])).toMatchInlineSnapshot(`
      "fn foo(x: f32) -> f32 {
        return (6f * x);
      }

      fn boo(x: f32) -> f32 {
        return (7f * x);
      }

      struct Weights {
        foo: f32,
        boo: f32,
      }

      fn computeWeight(weights: Weights) -> f32 {
        var p = 0f;
        {
          p += (weights.foo * foo(p));
        }
        {
          p += (weights.boo * boo(p));
        }
        return p;
      }"
    `);
  });

  it('unrolls array expression of pointers', () => {
    const f = () => {
      'use gpu';
      let res = d.vec2f();
      const v1 = d.vec2f(7);
      const v2 = d.vec2f(3);
      for (const foo of tgpu.unroll([v1, v2])) {
        const boo = foo;
        res = res.add(foo);
        boo.x = 6;
      }

      return res;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> vec2f {
        var res = vec2f();
        var v1 = vec2f(7);
        var v2 = vec2f(3);
        {
          let boo = (&v1);
          res = (res + v1);
          (*boo).x = 6f;
        }
        {
          let boo = (&v2);
          res = (res + v2);
          (*boo).x = 6f;
        }
        return res;
      }"
    `);
  });

  it('unrolls ephemeral vector', () => {
    const f = () => {
      'use gpu';
      let res = d.u32(0);
      for (const foo of tgpu.unroll(d.vec4u(1, 2, 3, 4))) {
        res += foo;
      }

      return res;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> u32 {
        var res = 0u;
        {
          res += 1u;
        }
        {
          res += 2u;
        }
        {
          res += 3u;
        }
        {
          res += 4u;
        }
        return res;
      }"
    `);
  });

  it('unrolls external compile-time iterable', () => {
    const arr = [1, 2, 3];

    const f = () => {
      'use gpu';
      let result = 0;
      for (const foo of tgpu.unroll(arr)) {
        result += foo;
      }

      return result;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        var result = 0;
        {
          result += 1i;
        }
        {
          result += 2i;
        }
        {
          result += 3i;
        }
        return result;
      }"
    `);
  });

  it('throws when iterable element count is unknown at compile-time', () => {
    const layout = tgpu.bindGroupLayout({
      arr: { storage: d.arrayOf(d.f32) },
    });

    const f = () => {
      'use gpu';
      let res = d.f32(0);
      for (const foo of tgpu.unroll(layout.$.arr)) {
        res += foo;
      }
    };

    expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f
      - fn*:f(): Cannot unroll loop. Length of iterable is unknown at compile-time.]
    `);
  });

  it('unrolls named iterable of primitives', () => {
    const f = () => {
      'use gpu';
      const arr = [1, 2, 3];
      let res = d.f32(0);
      for (const foo of tgpu.unroll(arr)) {
        res += foo;
      }

      return res;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> f32 {
        var arr = array<i32, 3>(1, 2, 3);
        var res = 0f;
        {
          res += f32(arr[0u]);
        }
        {
          res += f32(arr[1u]);
        }
        {
          res += f32(arr[2u]);
        }
        return res;
      }"
    `);
  });

  it('unrolls named iterable of vectors', () => {
    const f = () => {
      'use gpu';

      const v1 = d.vec2f(1);
      const v2 = d.vec2f(8);
      const v3 = d.vec2f(2);
      const arr = d.arrayOf(d.vec2f, 4)([v1, v2, v2, v3]);
      let res = d.vec2f();

      for (const foo of tgpu.unroll(arr)) {
        res = res.add(foo);
        foo.x = 7;
      }

      return res;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> vec2f {
        var v1 = vec2f(1);
        var v2 = vec2f(8);
        var v3 = vec2f(2);
        var arr = array<vec2f, 4>(v1, v2, v2, v3);
        var res = vec2f();
        {
          res = (res + arr[0u]);
          arr[0u].x = 7f;
        }
        {
          res = (res + arr[1u]);
          arr[1u].x = 7f;
        }
        {
          res = (res + arr[2u]);
          arr[2u].x = 7f;
        }
        {
          res = (res + arr[3u]);
          arr[3u].x = 7f;
        }
        return res;
      }"
    `);
  });

  it('unrolls named iterable of complex types', () => {
    const Boid = d.struct({
      pos: d.vec2i,
      vel: d.vec2f,
    });

    const f = () => {
      'use gpu';
      const b1 = Boid({ pos: d.vec2i(1), vel: d.vec2f(1) });
      const b2 = Boid({ pos: d.vec2i(2), vel: d.vec2f(2) });
      const arr = d.arrayOf(Boid, 2)([b1, b2]);
      let res = d.vec2f();

      for (const foo of tgpu.unroll(arr)) {
        res = res.add(foo.vel);
        foo.pos.x = 7;
      }

      return res;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec2i,
        vel: vec2f,
      }

      fn f() -> vec2f {
        var b1 = Boid(vec2i(1), vec2f(1));
        var b2 = Boid(vec2i(2), vec2f(2));
        var arr = array<Boid, 2>(b1, b2);
        var res = vec2f();
        {
          res = (res + arr[0u].vel);
          arr[0u].pos.x = 7i;
        }
        {
          res = (res + arr[1u].vel);
          arr[1u].pos.x = 7i;
        }
        return res;
      }"
    `);
  });

  it('unrolls buffer iterable', ({ root }) => {
    const b = root.createUniform(d.arrayOf(d.u32, 7));
    const acc = tgpu.accessor(d.arrayOf(d.u32, 7), b);

    const f = () => {
      'use gpu';
      let result = d.u32(0);
      for (const foo of tgpu.unroll(acc.$)) {
        result += foo;
      }

      return result;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> b: array<u32, 7>;

      fn f() -> u32 {
        var result = 0u;
        {
          result += b[0u];
        }
        {
          result += b[1u];
        }
        {
          result += b[2u];
        }
        {
          result += b[3u];
        }
        {
          result += b[4u];
        }
        {
          result += b[5u];
        }
        {
          result += b[6u];
        }
        return result;
      }"
    `);
  });

  it('can be conditionally applied', () => {
    const unroll = tgpu.accessor(d.bool, true);

    const f = () => {
      'use gpu';
      const arr = [1, 2, 3];
      let r = d.f32(0);
      for (const foo of (unroll.$ ? tgpu.unroll(arr) : arr)) {
        r += foo;
      }
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        var arr = array<i32, 3>(1, 2, 3);
        var r = 0f;
        {
          r += f32(arr[0u]);
        }
        {
          r += f32(arr[1u]);
        }
        {
          r += f32(arr[2u]);
        }
      }"
    `);
    expect(tgpu.resolve([tgpu.fn(f).with(unroll, false)]))
      .toMatchInlineSnapshot(`
        "fn f() {
          var arr = array<i32, 3>(1, 2, 3);
          var r = 0f;
          for (var i = 0u; i < 3; i++) {
            let foo = arr[i];
            {
              r += f32(foo);
            }
          }
        }"
      `);
  });

  it('throws when `continue` or `break` is used inside the loop body', () => {
    const f1 = () => {
      'use gpu';
      for (const foo of tgpu.unroll([1, 2])) {
        continue;
      }
    };

    expect(() => tgpu.resolve([f1])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f1
      - fn*:f1(): Cannot unroll loop containing \`break\` or \`continue\`]
    `);

    const f2 = () => {
      'use gpu';
      for (const foo of tgpu.unroll([1, 2])) {
        break;
      }
    };

    expect(() => tgpu.resolve([f2])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f2
      - fn*:f2(): Cannot unroll loop containing \`break\` or \`continue\`]
    `);
  });
});
