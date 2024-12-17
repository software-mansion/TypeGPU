import { parse } from '@typegpu/wgsl-parser';
import { describe, expect, vi } from 'vitest';
import * as d from '../src/data';
import tgpu from '../src/experimental';
import { it } from './utils/extendedIt';
import { parseResolved } from './utils/parseResolved';

describe('TgpuDerived', () => {
  it('memoizes results of transitive "derived"', () => {
    const foo = tgpu.slot<number>(1).$name('foo');
    const computeDouble = vi.fn(() => {
      return foo.value * 2;
    });
    const double = tgpu.derived(computeDouble);
    const a = tgpu.derived(() => double.value + 1);
    const b = tgpu.derived(() => double.value + 2);

    const main = tgpu
      .fn([], d.f32)
      .does(() => {
        return a.value + b.value;
      })
      .$name('main');

    expect(parseResolved(main)).toEqual(
      parse(`
      fn main() -> f32 {
        return 3 + 4;
      }
    `),
    );

    expect(computeDouble).toHaveBeenCalledTimes(1);
  });

  it('memoizes functions using derived values', () => {
    const foo = tgpu.slot<number>().$name('foo');
    const double = tgpu.derived(() => foo.value * 2);

    const getDouble = tgpu
      .fn([], d.f32)
      .does(() => {
        return double.value;
      })
      .$name('getDouble');

    const a = getDouble.with(foo, 2);
    const b = getDouble.with(foo, 2); // the same as `a`
    const c = getDouble.with(foo, 4);

    const main = tgpu
      .fn([])
      .does(() => {
        a();
        b();
        c();
      })
      .$name('main');

    expect(parseResolved(main)).toEqual(
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
    const gridSizeSlot = tgpu.slot<number>().$name('gridSize');

    const fill = tgpu.derived(() => {
      const gridSize = gridSizeSlot.value;

      return tgpu
        .fn([d.arrayOf(d.f32, gridSize)])
        .does((arr) => {
          // do something
        })
        .$name('fill');
    });

    const fillWith2 = fill.with(gridSizeSlot, 2);
    const fillWith3 = fill.with(gridSizeSlot, 3);

    const exampleArray: number[] = [];

    const main = tgpu
      .fn([])
      .does(() => {
        fill.value(exampleArray);
        fillWith2.value(exampleArray);
        fillWith3.value(exampleArray);
      })
      .with(gridSizeSlot, 1)
      .$name('main');

    expect(parseResolved(main)).toEqual(
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
