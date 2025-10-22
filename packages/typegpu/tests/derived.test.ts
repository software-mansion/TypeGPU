import { describe, expect, expectTypeOf, vi } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu, { type TgpuDerived } from '../src/index.ts';
import { mul } from '../src/std/index.ts';
import { it } from './utils/extendedIt.ts';
import { asWgsl } from './utils/parseResolved.ts';

describe('TgpuDerived', () => {
  it('memoizes results of transitive "derived"', () => {
    const foo = tgpu.slot<number>(1);
    const computeDouble = vi.fn(() => foo.$ * 2);
    const double = tgpu['~unstable'].derived(computeDouble);
    const a = tgpu['~unstable'].derived(() => double.$ + 1);
    const b = tgpu['~unstable'].derived(() => double.$ + 2);

    const main = () => {
      'use gpu';
      return a.$ + b.$;
    };

    expect(asWgsl(main)).toMatchInlineSnapshot(`
      "fn main() -> i32 {
        return 7;
      }"
    `);

    expect(computeDouble).toHaveBeenCalledTimes(1);
  });

  it('memoizes functions using derived values', () => {
    const foo = tgpu.slot<number>();
    const double = tgpu['~unstable'].derived(() => foo.value * 2);

    const getDouble = tgpu.fn([], d.f32)(() => {
      return double.value;
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

    expect(asWgsl(main)).toMatchInlineSnapshot(`
      "fn getDouble() -> f32 {
        return 4;
      }

      fn getDouble_1() -> f32 {
        return 8;
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

    const fill = tgpu['~unstable'].derived(() => {
      const gridSize = gridSizeSlot.value;

      return tgpu.fn([d.arrayOf(d.f32, gridSize)])(
        (arr) => {/* do something */},
      ).$name('fill');
    });

    const fillWith2 = fill.with(gridSizeSlot, 2);
    const fillWith3 = fill.with(gridSizeSlot, 3);

    const oneArray: number[] = [1];
    const twoArray: number[] = [1, 2];
    const threeArray: number[] = [1, 2, 3];

    const main = tgpu.fn([])(() => {
      fill.value(oneArray);
      fillWith2.value(twoArray);
      fillWith3.value(threeArray);
    })
      .with(gridSizeSlot, 1);

    expect(asWgsl(main)).toMatchInlineSnapshot(`
      "fn fill(arr: array<f32, 1>) {

      }

      fn fill_1(arr: array<f32, 2>) {

      }

      fn fill_2(arr: array<f32, 3>) {

      }

      fn main() {
        fill(array<f32, 1>(1));
        fill_1(array<f32, 2>(1, 2));
        fill_2(array<f32, 3>(1, 2, 3));
      }"
    `);
  });

  it('allows access to value in tgsl functions through the .value property ', ({ root }) => {
    const vectorSlot = tgpu.slot(d.vec3f(1, 2, 3));
    const doubledVectorSlot = tgpu['~unstable'].derived(() => {
      const vec = vectorSlot.value;

      return mul(2, vec);
    });

    const Boid = d.struct({
      pos: d.vec3f,
      vel: d.vec3u,
    });

    const buffer = root.createBuffer(Boid).$usage('uniform').$name('boid');
    const uniform = buffer.as('uniform');

    const derivedUniformSlot = tgpu['~unstable'].derived(() => uniform);
    const derivedDerivedUniformSlot = tgpu['~unstable'].derived(() =>
      derivedUniformSlot
    );

    const func = tgpu.fn([])(() => {
      const pos = doubledVectorSlot.value;
      const posX = doubledVectorSlot.value.x;
      const vel = derivedUniformSlot.value.vel;
      const velX = derivedUniformSlot.value.vel.x;

      const vel_ = derivedDerivedUniformSlot.value.vel;
      const velX_ = derivedDerivedUniformSlot.value.vel.x;
    });

    expect(asWgsl(func)).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
        vel: vec3u,
      }

      @group(0) @binding(0) var<uniform> boid: Boid;

      fn func() {
        var pos = vec3f(2, 4, 6);
        var posX = 2;
        var vel = boid.vel;
        var velX = boid.vel.x;
        var vel_ = boid.vel;
        var velX_ = boid.vel.x;
      }"
    `);
  });

  // TODO: rethink this behavior of derived returning a function,
  // in context of whether the function should automatically have
  // slot values set on derived and how to achieve that
  it('allows slot bindings to pass downstream from derived (#697)', () => {
    const valueSlot = tgpu['~unstable'].slot(1);

    const derivedFn = tgpu['~unstable'].derived(() => {
      return tgpu.fn([], d.f32)(() => valueSlot.$)
        .with(valueSlot, valueSlot.$) // currently necessary to work :/
        .$name('innerFn');
    });

    const derivedFnWith2 = derivedFn.with(valueSlot, 2);

    const main = tgpu.fn([])(() => {
      derivedFn.$();
      derivedFnWith2.$();
    });

    expect(asWgsl(main)).toMatchInlineSnapshot(`
      "fn innerFn() -> f32 {
        return 1;
      }

      fn innerFn_1() -> f32 {
        return 2;
      }

      fn main() {
        innerFn();
        innerFn_1();
      }"
    `);
  });

  it('does not allow defining derived values at resolution', () => {
    const gridSizeSlot = tgpu.slot<number>(2);
    const absGridSize = tgpu['~unstable'].derived(() =>
      gridSizeSlot.$ > 0
        ? tgpu['~unstable'].derived(() => gridSizeSlot.$).$
        : tgpu['~unstable'].derived(() => -gridSizeSlot.$).$
    );
    const fn = tgpu.fn([], d.u32)(() => absGridSize.$);

    expect(() => asWgsl(fn)).toThrow(
      'Cannot create tgpu.derived objects at the resolution stage.',
    );
  });

  it('can return dynamic schemas, which can be used in function bodies', () => {
    const halfPrecisionSlot = tgpu.slot(false);

    const ResultArray = tgpu['~unstable'].derived(() =>
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
      TgpuDerived<d.WgslArray<d.F16 | d.F32>>
    >();

    expect(asWgsl(main)).toMatchInlineSnapshot(`
      "fn foo() {
        var array = array<f32, 4>();
      }

      fn foo_1() {
        var array = array<f16, 4>();
      }

      fn main() {
        foo();
        foo_1();
      }"
    `);
  });
});
