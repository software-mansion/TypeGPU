import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';

describe('tgpu.unroll', () => {
  it('called outside shader and outside forOf returns passed iterable', () => {
    const arr = [1, 2, 3];
    const x = tgpu['~unstable'].unroll(arr);

    expect(x).toBe(arr);
  });

  it('called inside shader but outside forOf returns passed iterable', () => {
    const layout = tgpu.bindGroupLayout({
      arr: { storage: d.arrayOf(d.f32) },
    });

    const f = () => {
      'use gpu';
      const a = tgpu['~unstable'].unroll([1, 2, 3]);

      const v1 = d.vec2f(7);
      const v2 = tgpu['~unstable'].unroll(v1); // this should return a pointer
      const arr = tgpu['~unstable'].unroll(layout.$.arr); // this should return a pointer
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

  it('unrolls forOf of array expression of primitives', () => {
    const f = () => {
      'use gpu';
      let res = 0;
      for (const foo of tgpu['~unstable'].unroll([1, 2, 3])) {
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

  it('unrolls forOf with variable override', () => {
    const f = () => {
      'use gpu';
      const foo = d.vec3f(6);
      for (const foo of tgpu['~unstable'].unroll([d.vec3f(7), d.vec3f(3)])) { // this foo is in different block layer, it will be found first
        const boo = foo;
      }
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        var foo = vec3f(6);
        {
          var boo = vec3f(7);
        }
        {
          var boo = vec3f(3);
        }
      }"
    `);
  });

  it('unrolls forOf with variable from different scope override', () => {
    const foo = 2;

    const f = () => {
      'use gpu';
      for (const foo of tgpu['~unstable'].unroll([d.vec3f(7), d.vec3f(3)])) { // this foo is in different block layer, it will be found first
        const boo = foo;
      }
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        {
          var boo = vec3f(7);
        }
        {
          var boo = vec3f(3);
        }
      }"
    `);
  });

  it('unrolls forOf with variable being overriden', () => {
    const f = () => {
      'use gpu';
      let fooResult = d.f32(0);
      for (const foo of tgpu['~unstable'].unroll([d.vec3f(7), d.vec3f(3)])) {
        const boo = foo;
        {
          const foo = boo.x; // this foo is in different block layer, it will see the previous foo
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
          var boo = vec3f(7);
          {
            let foo2 = boo.x;
            fooResult += foo2;
          }
          var bar = vec3f(7);
        }
        {
          var boo = vec3f(3);
          {
            let foo2 = boo.x;
            fooResult += foo2;
          }
          var bar = vec3f(3);
        }
        return fooResult;
      }"
    `);
  });

  it('unrolls forOf of array expression of complex types', () => {
    const Boid = d.struct({
      pos: d.vec2i,
      vel: d.vec2f,
    });

    const f = () => {
      'use gpu';
      let res = d.vec2f();
      for (const foo of tgpu['~unstable'].unroll([d.vec2f(7), d.vec2f(3)])) {
        for (const boo of tgpu['~unstable'].unroll([Boid(), Boid()])) {
          res = res.add(foo).add(boo.vel);
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
        var res = vec2f();
        {
          {
            res = ((res + vec2f(7)) + Boid().vel);
          }
          {
            res = ((res + vec2f(7)) + Boid().vel);
          }
        }
        {
          {
            res = ((res + vec2f(3)) + Boid().vel);
          }
          {
            res = ((res + vec2f(3)) + Boid().vel);
          }
        }
        return res;
      }"
    `);
  });

  it('unrolls forOf of array expression of copied values', () => {
    const f = () => {
      'use gpu';
      let res = d.vec2f();
      const v1 = d.vec2f(7);
      const v2 = d.vec2f(3);
      for (const foo of tgpu['~unstable'].unroll([d.vec2f(v1), d.vec2f(v2)])) {
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

  it('unrolls forOf of external comptime iterable', () => {
    const arr = [1, 2, 3];

    const f = () => {
      'use gpu';
      let result = 0;
      for (const foo of tgpu['~unstable'].unroll(arr)) {
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

  it.skip('throws error when number of iterations is unknown at comptime', () => {
    const layout = tgpu.bindGroupLayout({
      arr: { storage: d.arrayOf(d.f32) },
    });

    const f = () => {
      'use gpu';
      let res = d.f32(0);
      for (const foo of tgpu['~unstable'].unroll(layout.$.arr)) {
        res += foo;
      }
    };

    expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f
      - fn*:f(): Cannot unroll loop. Number of iterations unknown at compile time]
    `);
  });

  // TODO
  //
  // add basic external, derived, maybe slot and accessor
  //
  // const arr = [1, 2, 3];
  // for (const foo of tgpu['~unstable'].unroll(arr)) { // should operate on indices
  //   result -= foo;
  // }

  // const v = d.vec2f();
  // for (const foo of tgpu['~unstable'].unroll(v)) { // should operate on indices
  //   result *= foo;
  // }

  // for (const foo of tgpu['~unstable'].unroll([1, 2, 3])) { // should operate on values
  //   const foo = 1;
  //   result += d.f32(foo);
  // }

  // const foo = 1;
  // for (const foo of tgpu['~unstable'].unroll([1, 2, 3])) { // should operate on values
  //   result += d.f32(foo);
  // }
});
