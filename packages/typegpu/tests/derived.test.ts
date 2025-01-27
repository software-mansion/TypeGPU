import { parse } from 'tgpu-wgsl-parser';
import { describe, expect, vi } from 'vitest';
import tgpu from '../src';
import * as d from '../src/data';
import { it } from './utils/extendedIt';
import { parseResolved } from './utils/parseResolved';

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
      .fn([], d.f32)
      .does(() => {
        return a.value + b.value;
      })
      .$name('main');

    expect(parseResolved({ main })).toEqual(
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
      .fn([], d.f32)
      .does(() => {
        return double.value;
      })
      .$name('getDouble');

    const a = getDouble.with(foo, 2);
    const b = getDouble.with(foo, 2); // the same as `a`
    const c = getDouble.with(foo, 4);

    const main = tgpu['~unstable']
      .fn([])
      .does(() => {
        a();
        b();
        c();
      })
      .$name('main');

    expect(parseResolved({ main })).toEqual(
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
        .fn([d.arrayOf(d.f32, gridSize)])
        .does((arr) => {
          // do something
        })
        .$name('fill');
    });

    const fillWith2 = fill.with(gridSizeSlot, 2);
    const fillWith3 = fill.with(gridSizeSlot, 3);

    const exampleArray: number[] = [];

    const main = tgpu['~unstable']
      .fn([])
      .does(() => {
        fill.value(exampleArray);
        fillWith2.value(exampleArray);
        fillWith3.value(exampleArray);
      })
      .with(gridSizeSlot, 1)
      .$name('main');

    expect(parseResolved({ main })).toEqual(
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

  it('allows slot bindings to pass downstream from derived (#697)', () => {
    const utgpu = tgpu['~unstable'];
    const valueSlot = utgpu.slot(1).$name('valueSlot');

    const derivedFn = utgpu.derived(() => {
      return utgpu
        .fn([], d.f32)
        .does(() => valueSlot.value)
        .$name('innerFn');
    });

    const derivedFnWith2 = derivedFn.with(valueSlot, 2);

    const mainFn = utgpu
      .fn([])
      .does(() => {
        derivedFn.value();
        derivedFnWith2.value();
      })
      .$name('main');

    expect(parseResolved({ mainFn })).toEqual(
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
