import { describe, expect, expectTypeOf, vi } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu, { type TgpuLazy } from '../src/index.js';
import { mul } from '../src/std/index.ts';
import { it } from './utils/extendedIt.ts';

describe('TgpuLazy', () => {
  it('memoizes results of transitive "lazy" objects', () => {
    const foo = tgpu.slot<number>(1);
    const computeDouble = vi.fn(() => foo.$ * 2);
    const double = tgpu.lazy(computeDouble);
    const a = tgpu.lazy(() => double.$ + 1);
    const b = tgpu.lazy(() => double.$ + 2);

    const main = () => {
      'use gpu';
      return a.$ + b.$;
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> i32 {
        return 7;
      }"
    `);

    expect(computeDouble).toHaveBeenCalledTimes(1);
  });

  it('memoizes functions using lazy values', () => {
    const foo = tgpu.slot<number>();
    const double = tgpu.lazy(() => foo.$ * 2);

    const getDouble = tgpu.fn([], d.f32)(() => {
      return double.$;
    });

    const a = getDouble.with(foo, 2);
    const b = getDouble.with(foo, 2); // the same as `a`
    const c = getDouble.with(foo, 4);

    const main = () => {
      'use gpu';
      a();
      b();
      c();
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn getDouble() -> f32 {
        return 4f;
      }

      fn getDouble_1() -> f32 {
        return 8f;
      }

      fn main() {
        getDouble();
        getDouble();
        getDouble_1();
      }"
    `);
  });

  it('can use slot values from its surrounding context', () => {
    const gridSizeSlot = tgpu.slot<number>();

    const fill = tgpu.lazy(() => {
      const gridSize = gridSizeSlot.$;

      return tgpu.fn([d.arrayOf(d.f32, gridSize)])((arr) => {
        /* do something */
      }).$name('fill');
    });

    const fill2 = fill.with(gridSizeSlot, 2);
    const fill3 = fill.with(gridSizeSlot, 3);

    const oneArray: number[] = [1];
    const twoArray: number[] = [1, 2];
    const threeArray: number[] = [1, 2, 3];

    const main = tgpu.fn([])(() => {
      fill.$(oneArray);
      fill2.$(twoArray);
      fill3.$(threeArray);
    })
      .with(gridSizeSlot, 1);

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn fill(arr: array<f32, 1>) {

      }

      fn fill_1(arr: array<f32, 2>) {

      }

      fn fill_2(arr: array<f32, 3>) {

      }

      fn main() {
        fill(array<f32, 1>(1f));
        fill_1(array<f32, 2>(1f, 2f));
        fill_2(array<f32, 3>(1f, 2f, 3f));
      }"
    `);
  });

  it('allows access to value in tgsl functions through the .$ property ', ({ root }) => {
    const vectorSlot = tgpu.slot(d.vec3f(1, 2, 3));
    const doubledVectorSlot = tgpu.lazy(() => {
      const vec = vectorSlot.$;

      return mul(2, vec);
    });

    const Boid = d.struct({
      pos: d.vec3f,
      vel: d.vec3u,
    });

    const buffer = root.createBuffer(Boid).$usage('uniform').$name('boid');
    const uniform = buffer.as('uniform');

    const lazyUniformSlot = tgpu.lazy(() => uniform);
    const lazyLazyUniformSlot = tgpu.lazy(() => lazyUniformSlot);

    const func = tgpu.fn([])(() => {
      const pos = doubledVectorSlot.$;
      const posX = doubledVectorSlot.$.x;
      const vel = lazyUniformSlot.$.vel;
      const velX = lazyUniformSlot.$.vel.x;

      const vel_ = lazyLazyUniformSlot.$.vel;
      const velX_ = lazyLazyUniformSlot.$.vel.x;
    });

    expect(tgpu.resolve([func])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
        vel: vec3u,
      }

      @group(0) @binding(0) var<uniform> boid: Boid;

      fn func() {
        var pos = vec3f(2, 4, 6);
        const posX = 2f;
        let vel = (&boid.vel);
        let velX = boid.vel.x;
        let vel_ = (&boid.vel);
        let velX_ = boid.vel.x;
      }"
    `);
  });

  it('allows slot bindings to pass downstream from lazy (#697)', () => {
    const valueSlot = tgpu.slot(1);

    const foo = tgpu.lazy(() => {
      return tgpu.fn([], d.f32)(() => {
        return valueSlot.$;
      })
        // Making the function inherit values bound to this lazy
        .with(valueSlot, valueSlot.$);
    });

    const foo2 = foo.with(valueSlot, 2);
    const main = tgpu.fn([])(() => {
      foo.$();
      foo2.$();
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn item() -> f32 {
        return 1f;
      }

      fn item_1() -> f32 {
        return 2f;
      }

      fn main() {
        item();
        item_1();
      }"
    `);
  });

  it('does not allow defining lazy values at resolution', () => {
    const gridSizeSlot = tgpu.slot<number>(2);
    const absGridSize = tgpu.lazy(() =>
      gridSizeSlot.$ > 0
        ? tgpu.lazy(() => gridSizeSlot.$).$
        : tgpu.lazy(() => -gridSizeSlot.$).$
    );
    const fn = tgpu.fn([], d.u32)(() => absGridSize.$);

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:fn
      - lazy: Cannot create tgpu.lazy objects during shader resolution.]
    `);
  });

  it('can return dynamic schemas, which can be used in function bodies', () => {
    const halfPrecisionSlot = tgpu.slot(false);

    const ResultArray = tgpu.lazy(() =>
      d.arrayOf(halfPrecisionSlot.$ ? d.f16 : d.f32, 4)
    );

    const foo = tgpu.fn([])(() => {
      const array = ResultArray.$();
    });

    const fooHalf = foo.with(halfPrecisionSlot, true);

    const main = () => {
      'use gpu';
      foo();
      fooHalf();
    };

    expectTypeOf(ResultArray).toEqualTypeOf<
      TgpuLazy<d.WgslArray<d.F16 | d.F32>>
    >();

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn foo() {
        var array_1 = array<f32, 4>();
      }

      fn foo_1() {
        var array_1 = array<f16, 4>();
      }

      fn main() {
        foo();
        foo_1();
      }"
    `);
  });
});
