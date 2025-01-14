import { parse } from 'tgpu-wgsl-parser';
import { describe, expect, vi } from 'vitest';
import { fn } from '../src/core/function/tgpuFn';
import { derived } from '../src/core/slot/derived';
import { slot } from '../src/core/slot/slot';
import * as d from '../src/data';
import { it } from './utils/extendedIt';
import { parseResolved } from './utils/parseResolved';

describe('TgpuDerived', () => {
  it('memoizes results of transitive "derived"', () => {
    const foo = slot<number>(1).$name('foo');
    const computeDouble = vi.fn(() => {
      return foo.value * 2;
    });
    const double = derived(computeDouble);
    const a = derived(() => double.value + 1);
    const b = derived(() => double.value + 2);

    const main = fn([], d.f32)
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
    const foo = slot<number>().$name('foo');
    const double = derived(() => foo.value * 2);

    const getDouble = fn([], d.f32)
      .does(() => {
        return double.value;
      })
      .$name('getDouble');

    const a = getDouble.with(foo, 2);
    const b = getDouble.with(foo, 2); // the same as `a`
    const c = getDouble.with(foo, 4);

    const main = fn([])
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
    const gridSizeSlot = slot<number>().$name('gridSize');

    const fill = derived(() => {
      const gridSize = gridSizeSlot.value;

      return fn([d.arrayOf(d.f32, gridSize)])
        .does((arr) => {
          // do something
        })
        .$name('fill');
    });

    const fillWith2 = fill.with(gridSizeSlot, 2);
    const fillWith3 = fill.with(gridSizeSlot, 3);

    const exampleArray: number[] = [];

    const main = fn([])
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
});
