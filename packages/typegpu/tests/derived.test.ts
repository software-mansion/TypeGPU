import { describe, expect, vi } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { mul } from '../src/std/index.ts';
import { it } from './utils/extendedIt.ts';
import { parse, parseResolved } from './utils/parseResolved.ts';

describe('TgpuDerived', () => {
  it('memoizes results of transitive "derived"', () => {
    const foo = tgpu.slot<number>(1);
    const computeDouble = vi.fn(() => {
      return foo.value * 2;
    });
    const double = tgpu['~unstable'].derived(computeDouble);
    const a = tgpu['~unstable'].derived(() => double.value + 1);
    const b = tgpu['~unstable'].derived(() => double.value + 2);

    const main = tgpu.fn([], d.f32)(() => {
      return a.value + b.value;
    });

    expect(parseResolved({ main })).toBe(
      parse(`
      fn main() -> f32 {
        return (3 + 4);
      }
    `),
    );

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

    const main = tgpu.fn([])(() => {
      a();
      b();
      c();
    });

    expect(parseResolved({ main })).toBe(
      parse(`
      fn getDouble() -> f32 {
        return 4;
      }

      fn getDouble_1() -> f32 {
        return 8;
      }

      fn main() {
        getDouble();
        getDouble();
        getDouble_1();
      }
    `),
    );
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

    const exampleArray: number[] = [1, 2, 3];

    const main = tgpu.fn([])(() => {
      fill.value(exampleArray);
      fillWith2.value(exampleArray);
      fillWith3.value(exampleArray);
    })
      .with(gridSizeSlot, 1);

    expect(parseResolved({ main })).toBe(
      parse(/* wgsl */ `
      fn fill(arr: array<f32, 1>) {}
      fn fill_1(arr: array<f32, 2>) {}
      fn fill_2(arr: array<f32, 3>) {}

      fn main() {
        fill(1, 2, 3);
        fill_1(1, 2, 3);
        fill_2(1, 2, 3);
      }
    `),
    );
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

    const resolved = tgpu.resolve({
      externals: { func },
      names: 'strict',
    });

    expect(parse(resolved)).toBe(
      parse(`
        struct Boid {
          pos: vec3f,
          vel: vec3u,
        }

        @group(0) @binding(0) var<uniform> boid: Boid;

        fn func(){
          var pos = vec3f(2, 4, 6);
          var posX = 2;
          var vel = boid.vel;
          var velX = boid.vel.x;

          var vel_ = boid.vel;
          var velX_ = boid.vel.x;
        }`),
    );
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

    expect(parseResolved({ main })).toBe(
      parse(`
        fn innerFn() -> f32 {
          return 1;
        }

        fn innerFn_1() -> f32 {
          return 2;
        }

        fn main() {
          innerFn();
          innerFn_1();
        }
      `),
    );
  });

  it('does not allow defining derived values at resolution', () => {
    const gridSizeSlot = tgpu.slot<number>(2);
    const absGridSize = tgpu['~unstable'].derived(() =>
      gridSizeSlot.$ > 0
        ? tgpu['~unstable'].derived(() => gridSizeSlot.$).$
        : tgpu['~unstable'].derived(() => -gridSizeSlot.$).$
    );
    const fn = tgpu.fn([], d.u32)(() => absGridSize.$);

    expect(() => parseResolved({ fn })).toThrow(
      'Cannot create tgpu.derived objects at the resolution stage.',
    );
  });
});
