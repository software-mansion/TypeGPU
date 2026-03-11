import { describe, expect, it } from 'vitest';
import { d, tgpu } from '../src/index.js';

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

      fn fn1() -> u32{ return x; }"
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

  it('cannot be passed directly to shellless functions', () => {
    const fn1 = (v: d.v3f) => {
      'use gpu';
      return v.x * v.y * v.z;
    };

    const foo = tgpu.const(d.vec3f, d.vec3f(1, 2, 3));
    const fn2 = () => {
      'use gpu';
      return fn1(foo.$);
    };

    expect(() => tgpu.resolve([fn2])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn2
      - fn*:fn2(): Cannot pass constant references as function arguments. Explicitly copy them by wrapping them in a schema: 'vec3f(...)']
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
      - fn*:fn(): 'boid.pos = vec3f()' is invalid, because boid.pos is a constant. This error may also occur when assigning to a value defined outside of a TypeGPU function's scope.]
    `);

    // Since we freeze the object, we cannot mutate when running the function in JS either
    expect(() => fn()).toThrowErrorMatchingInlineSnapshot(
      `[TypeError: Cannot assign to read only property 'pos' of object '#<Object>']`,
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

  it('cannot be passed directly to shellless functions', () => {
    const fn1 = (v: d.v3f) => {
      'use gpu';
      return v.x * v.y * v.z;
    };

    const foo = tgpu.const(d.vec3f, d.vec3f(1, 2, 3));
    const fn2 = () => {
      'use gpu';
      return fn1(foo.$);
    };

    expect(() => tgpu.resolve([fn2])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn2
      - fn*:fn2(): Cannot pass constant references as function arguments. Explicitly copy them by wrapping them in a schema: 'vec3f(...)']
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
      - fn*:fn(): 'boid.pos = vec3f()' is invalid, because boid.pos is a constant. This error may also occur when assigning to a value defined outside of a TypeGPU function's scope.]
    `);

    // Since we freeze the object, we cannot mutate when running the function in JS either
    expect(() => fn()).toThrowErrorMatchingInlineSnapshot(
      `[TypeError: Cannot assign to read only property 'pos' of object '#<Object>']`,
    );
  });
});
