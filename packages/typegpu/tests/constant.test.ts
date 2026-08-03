import { describe, expect, it } from 'vitest';
import { d, tgpu } from 'typegpu';
import { extractSnippetFromFn } from './utils/parseResolved.ts';

const Boid = d.struct({
  pos: d.vec3f,
  vel: d.vec3u,
});

describe('tgpu.const', () => {
  it('should inject const declaration when used in shelled WGSL functions', () => {
    const x = tgpu.const(d.u32, 2);
    const fn1 = tgpu.fn([], d.u32)`() { return x; }`.$uses({ x });

    expect(tgpu.resolve([fn1])).toMatchInlineSnapshot(`
      "const x: u32 = 2u;

      fn fn1() -> u32 { return x; }"
    `);
  });

  it('allows accessing constants in TypeGPU functions through .$', () => {
    const boid = tgpu.const(Boid, {
      pos: d.vec3f(1, 2, 3),
      vel: d.vec3u(4, 5, 6),
    });

    const func = tgpu.fn([])(() => {
      const pos = boid.$;
      const vel = boid.$.vel;
      const velX = boid.$.vel.x;
    });

    expect(tgpu.resolve([func])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
        vel: vec3u,
      }

      const boid: Boid = Boid(vec3f(1, 2, 3), vec3u(4, 5, 6));

      fn func() {
        const pos = boid;
        const vel = boid.vel;
        const velX = boid.vel.x;
      }"
    `);
  });

  it('can be passed directly to shellless functions (as arguments cannot be mutated anyway)', () => {
    const fn1 = (v: d.v3f) => {
      'use gpu';
      return v.x * v.y * v.z;
    };

    const foo = tgpu.const(d.vec3f, d.vec3f(1, 2, 3));
    const fn2 = () => {
      'use gpu';
      return fn1(foo.$);
    };

    expect(tgpu.resolve([fn2])).toMatchInlineSnapshot(`
      "fn fn1(v: vec3f) -> f32 {
        return ((v.x * v.y) * v.z);
      }

      const foo: vec3f = vec3f(1, 2, 3);

      fn fn2() -> f32 {
        return fn1(foo);
      }"
    `);
  });

  it('cannot be mutated', () => {
    const boid = tgpu.const(Boid, {
      pos: d.vec3f(1, 2, 3),
      vel: d.vec3u(4, 5, 6),
    });

    const fn = () => {
      'use gpu';
      // @ts-expect-error: Cannot assign to read-only property
      boid.$.pos = d.vec3f(0, 0, 0);
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): 'boid.$.pos = d.vec3f(0, 0, 0)' is invalid, because the left side is a constant.]
    `);

    // Since we freeze the object, we cannot mutate when running the function in JS either
    expect(() => fn()).toThrowErrorMatchingInlineSnapshot(
      `[TypeError: Cannot assign to read only property 'pos' of object '#<Object>']`,
    );
  });

  it('cannot be updated', () => {
    const boid = tgpu.const(d.vec3f, d.vec3f());

    const fn = () => {
      'use gpu';
      boid.$.x++;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): 'boid.$.x++' is invalid, because the left side is a constant.]
    `);

    // Since we freeze the object, we cannot mutate when running the function in JS either
    expect(() => fn()).toThrowErrorMatchingInlineSnapshot(
      `[TypeError: Cannot assign to read only property 'e0' of object '[object Array]']`,
    );
  });

  it('looses its `constant` origin when indexing with runtime value', () => {
    const positions = tgpu.const(d.arrayOf(d.vec3f, 3), [d.vec3f(0), d.vec3f(1), d.vec3f(2)]);

    const foo = (idx: number) => {
      'use gpu';
      const pos = positions.$[idx];
    };

    const main = () => {
      'use gpu';
      foo(0);
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "const positions: array<vec3f, 3> = array<vec3f, 3>(vec3f(), vec3f(1), vec3f(2));

      fn foo(idx: i32) {
        let pos = positions[idx];
      }

      fn main() {
        foo(0i);
      }"
    `);
  });

  it('can infer array length for partially-applied array schema', () => {
    const positions = tgpu.const(d.arrayOf(d.vec3f), [d.vec3f(1), d.vec3f(2)]);

    const main = () => {
      'use gpu';
      const pos = positions.$[1];
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "const positions: array<vec3f, 2> = array<vec3f, 2>(vec3f(1), vec3f(2));

      fn main() {
        const pos = positions[1i];
      }"
    `);
  });

  it('forbids assignment to consts', () => {
    const c = tgpu.const(d.vec2u, d.vec2u(1, 2));
    const testFn = () => {
      'use gpu';
      // @ts-expect-error
      c.$ = d.vec2u();
    };

    expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:testFn
      - fn*:testFn(): 'c.$ = d.vec2u()' is invalid, because the left side is a constant.]
    `);
  });

  it('forbids assignment to const props', () => {
    const c = tgpu.const(d.vec2u, d.vec2u(1, 2));
    const testFn = () => {
      'use gpu';
      c.$.x = 1;
    };

    expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:testFn
      - fn*:testFn(): 'c.$.x = 1' is invalid, because the left side is a constant.]
    `);
  });

  it('allows for tgpu.const-tgpu.const index access', () => {
    const myConstArray = tgpu.const(d.arrayOf(d.u32, 2), [1, 2]);
    const myConstIndex = tgpu.const(d.u32, 1);

    const fn = () => {
      'use gpu';
      return myConstArray.$[myConstIndex.$];
    };

    expect(extractSnippetFromFn(fn).origin).toBe('constant-immutable-def');
  });

  it('forbids assignment to runtime-known consts', () => {
    const c = tgpu.const(d.arrayOf(d.f32), [1, 2, 3]);
    function testFn() {
      'use gpu';
      const index = 0;
      // @ts-expect-error
      c.$[index] = 1;
    }

    expect(
      extractSnippetFromFn(() => {
        'use gpu';
        const index = 0;
        return c.$[index];
      }).origin,
    ).toEqual('runtime-immutable-def');

    expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:testFn
      - fn*:testFn(): 'c.$[index] = 1' is invalid, because the left side is a constant.]
    `);
  });
});
