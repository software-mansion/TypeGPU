import { describe, expect, vi } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { mul } from '../src/std/index.ts';
import { it } from './utils/extendedIt.ts';
import { parse, parseResolved } from './utils/parseResolved.ts';

describe('TgpuDerived', () => {
  it('memoizes results of transitive "derived"', () => {
    const foo = tgpu['~unstable'].slot<number>(1).$name('foo');
    const computeDouble = vi.fn(() => {
      return foo.value * 2;
    });
    const double = tgpu['~unstable'].derived(computeDouble);
    const a = tgpu['~unstable'].derived(() => double.value + 1);
    const b = tgpu['~unstable'].derived(() => double.value + 2);

    const main = tgpu['~unstable']
      .fn(
        [],
        d.f32,
      )(() => {
        return a.value + b.value;
      })
      .$name('main');

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
    const foo = tgpu['~unstable'].slot<number>().$name('foo');
    const double = tgpu['~unstable'].derived(() => foo.value * 2);

    const getDouble = tgpu['~unstable']
      .fn(
        [],
        d.f32,
      )(() => {
        return double.value;
      })
      .$name('getDouble');

    const a = getDouble.with(foo, 2);
    const b = getDouble.with(foo, 2); // the same as `a`
    const c = getDouble.with(foo, 4);

    const main = tgpu['~unstable']
      .fn([])(() => {
        a();
        b();
        c();
      })
      .$name('main');

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
    const gridSizeSlot = tgpu['~unstable'].slot<number>().$name('gridSize');

    const fill = tgpu['~unstable'].derived(() => {
      const gridSize = gridSizeSlot.value;

      return tgpu['~unstable']
        .fn([d.arrayOf(d.f32, gridSize)])((arr) => {
          // do something
        })
        .$name('fill');
    });

    const fillWith2 = fill.with(gridSizeSlot, 2);
    const fillWith3 = fill.with(gridSizeSlot, 3);

    const exampleArray: number[] = [];

    const main = tgpu['~unstable']
      .fn([])(() => {
        fill.value(exampleArray);
        fillWith2.value(exampleArray);
        fillWith3.value(exampleArray);
      })
      .with(gridSizeSlot, 1)
      .$name('main');

    expect(parseResolved({ main })).toBe(
      parse(/* wgsl */ `
      fn fill(arr: array<f32, 1>) {}
      fn fill_1(arr: array<f32, 2>) {}
      fn fill_2(arr: array<f32, 3>) {}

      fn main() {
        fill();
        fill_1();
        fill_2();
      }
    `),
    );
  });

  it('allows access to value in tgsl functions through the .value property ', ({
    root,
  }) => {
    const vectorSlot = tgpu['~unstable'].slot(d.vec3f(1, 2, 3));
    const doubledVectorSlot = tgpu['~unstable'].derived(() => {
      const vec = vectorSlot.value;

      return mul(2, vec);
    });

    const Boid = d
      .struct({
        pos: d.vec3f,
        vel: d.vec3u,
      })
      .$name('Boid');

    const buffer = root.createBuffer(Boid).$usage('uniform').$name('boid');
    const uniform = buffer.as('uniform');

    const derivedUniformSlot = tgpu['~unstable'].derived(() => uniform);
    const derivedDerivedUniformSlot = tgpu['~unstable'].derived(
      () => derivedUniformSlot,
    );

    const func = tgpu['~unstable'].fn([])(() => {
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
    const utgpu = tgpu['~unstable'];
    const valueSlot = utgpu.slot(1).$name('valueSlot');

    const derivedFn = utgpu.derived(() => {
      return tgpu['~unstable']
        .fn(
          [],
          d.f32,
        )(() => valueSlot.value)
        .with(valueSlot, valueSlot.value) // currently necessary to work :/
        .$name('innerFn');
    });

    const derivedFnWith2 = derivedFn.with(valueSlot, 2);

    const mainFn = tgpu['~unstable']
      .fn([])(() => {
        derivedFn.value();
        derivedFnWith2.value();
      })
      .$name('main');

    expect(parseResolved({ mainFn })).toBe(
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
});
