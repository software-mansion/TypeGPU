import { parse } from 'tgpu-wgsl-parser';
import { describe, expect, it } from 'vitest';
import { fn } from '../src/core/function/tgpuFn';
import { resolve } from '../src/core/resolve/tgpuResolve';
import { slot } from '../src/core/slot/slot';
import * as d from '../src/data';
import { MissingSlotValueError, ResolutionError } from '../src/errors';
import type { TgpuResolvable } from '../src/types';
import { parseResolved } from './utils/parseResolved';

const RED = 'vec3f(1., 0., 0.)';
const GREEN = 'vec3f(0., 1., 0.)';

/**
 * Using `tgpu.resolve()` wraps all inputs into a root object.
 * This mock allows us to verify that proper resolution errors are
 * getting thrown, with the root on top.
 */
const resolutionRootMock = {
  toString() {
    return '<root>';
  },
} as TgpuResolvable;

describe('tgpu.slot', () => {
  it('resolves to default value if no value provided', () => {
    const colorSlot = slot(RED).$name('color'); // red by default

    const getColor = fn([], d.vec3f)
      .does(/* wgsl */ `() -> vec3f {
        return colorSlot;
      }`)
      .$name('getColor')
      .$uses({ colorSlot });

    const actual = parseResolved({ getColor });

    expect(actual).toEqual(
      parse(/* wgsl */ `
      fn getColor() -> vec3f {
        return ${RED};
      }
    `),
    );
  });

  it('resolves to provided value rather than default value', () => {
    const colorSlot = slot(RED).$name('color'); // red by default

    const getColor = fn([], d.vec3f)
      .does(/* wgsl */ `() -> vec3f {
        return colorSlot;
      }`)
      .$name('getColor')
      .$uses({ colorSlot });

    // overriding to green
    const getColorWithGreen = getColor.with(colorSlot, GREEN);

    const main = fn([])
      .does(`() {
        return getColorWithGreen();
      }`)
      .$name('main')
      .$uses({ getColorWithGreen });

    const actual = parseResolved({ main });
    expect(actual).toEqual(
      parse(/* wgsl */ `
      fn getColor() -> vec3f {
        return ${GREEN};
      }

      fn main() {
        return getColor();
      }
    `),
    );
  });

  it('resolves to provided value', () => {
    const colorSlot = slot<string>().$name('color'); // no default

    const getColor = fn([], d.vec3f)
      .does(/* wgsl */ `() {
        return colorSlot;
      }`)
      .$name('getColor')
      .$uses({ colorSlot });

    // overriding to green
    const getColorWithGreen = getColor.with(colorSlot, 'vec3f(0., 1., 0.)');

    const main = fn([])
      .does(/* wgsl */ `() {
        getColorWithGreen();
      }`)
      .$name('main')
      .$uses({ getColorWithGreen });

    const actual = parseResolved({ main });

    // should be green
    expect(actual).toEqual(
      parse(`
        fn getColor() {
          return vec3f(0., 1., 0.);
        }

        fn main() {
          getColor();
        }
    `),
    );
  });

  it('throws error when no default nor value provided', () => {
    const colorSlot = slot<string>().$name('color');

    const getColor = fn([], d.vec3f)
      .does(`() {
        return colorSlot;
      })`)
      .$name('getColor')
      .$uses({ colorSlot });

    expect(() => resolve({ externals: { getColor }, names: 'strict' })).toThrow(
      new ResolutionError(new MissingSlotValueError(colorSlot), [
        resolutionRootMock,
        getColor,
      ]),
    );
  });

  it('prefers closer scope', () => {
    const colorSlot = slot<string>().$name('color'); // no default

    const getColor = fn([], d.vec3f)
      .does(/* wgsl */ `() -> vec3f {
        return colorSlot;
      }`)
      .$name('getColor')
      .$uses({ colorSlot });

    const getColorWithRed = getColor.with(colorSlot, RED);
    const getColorWithGreen = getColor.with(colorSlot, GREEN);

    const wrapperFn = fn([])
      .does(/* wgsl */ `() {
      return getColorWithGreen();
    }`)
      .$uses({ getColorWithGreen })
      .$name('wrapper')
      .with(colorSlot, RED);

    const main = fn([])
      .does(/* wgsl */ `() {
        getColorWithRed();
        wrapperFn();
      }`)
      .$uses({ getColorWithRed, wrapperFn })
      .$name('main');

    const actual = parseResolved({ main });

    const expected = parse(/* wgsl */ `
      fn getColor() -> vec3f {
        return ${RED};
      }

      fn getColor_1() -> vec3f {
        return ${GREEN};
      }

      fn wrapper() {
        return getColor_1();
      }

      fn main() {
        getColor();
        wrapper();
      }
    `);

    expect(actual).toEqual(expected);
  });

  it('reuses common nested functions', () => {
    const sizeSlot = slot<1 | 100>().$name('size');
    const colorSlot = slot<typeof RED | typeof GREEN>().$name('color');

    const getSize = fn([], d.f32)
      .does(/* wgsl */ `() -> f32 {
        return sizeSlot;
      }`)
      .$uses({ sizeSlot })
      .$name('getSize');

    const getColor = fn([], d.vec3f)
      .does(/* wgsl */ `() -> vec3f {
        return colorSlot;
      }`)
      .$uses({ colorSlot })
      .$name('getColor');

    const sizeAndColor = fn([])
      .does(`() {
        getSize();
        getColor();
      }`)
      .$uses({ getSize, getColor })
      .$name('sizeAndColor');

    const wrapperFn = fn([])
      .does(`() {
        sizeAndColor();
      }`)
      .$uses({ sizeAndColor })
      .$name('wrapper');

    const wrapperWithSmallRed = wrapperFn
      .with(sizeSlot, 1)
      .with(colorSlot, RED);
    const wrapperWithBigRed = wrapperFn
      .with(sizeSlot, 100)
      .with(colorSlot, RED);
    const wrapperWithSmallGreen = wrapperFn
      .with(sizeSlot, 1)
      .with(colorSlot, GREEN);
    const wrapperWithBigGreen = wrapperFn
      .with(sizeSlot, 100)
      .with(colorSlot, GREEN);

    const main = fn([])
      .does(`() {
        wrapperWithSmallRed();
        wrapperWithBigRed();
        wrapperWithSmallGreen();
        wrapperWithBigGreen();
      }`)
      .$uses({
        wrapperWithSmallRed,
        wrapperWithBigRed,
        wrapperWithSmallGreen,
        wrapperWithBigGreen,
      })
      .$name('main');

    const actual = parseResolved({ main });

    const expected = parse(`
      fn getSize() -> f32 {
        return 1;
      }

      fn getColor() -> vec3f {
        return ${RED};
      }

      fn sizeAndColor() {
        getSize();
        getColor();
      }

      fn wrapper() {
        sizeAndColor();
      }

      fn getSize_1() -> f32 {
        return 100;
      }

      fn sizeAndColor_1() {
        getSize_1();
        getColor();
      }

      fn wrapper_1() {
        sizeAndColor_1();
      }

      fn getColor_1() -> vec3f {
        return ${GREEN};
      }

      fn sizeAndColor_2() {
        getSize();
        getColor_1();
      }

      fn wrapper_2() {
        sizeAndColor_2();
      }

      fn sizeAndColor_3() {
        getSize_1();
        getColor_1();
      }

      fn wrapper_3() {
        sizeAndColor_3();
      }

      fn main() {
        wrapper();
        wrapper_1();
        wrapper_2();
        wrapper_3();
      }
    `);

    expect(actual).toEqual(expected);
  });

  it('unwraps layers of slots', () => {
    const slotA = slot(1).$name('a');
    const slotB = slot(2).$name('b');
    const slotC = slot(3).$name('c');
    const slotD = slot(4).$name('d');

    const fn1 = fn([])
      .does('() { let value = slotA; }')
      .$uses({ slotA })
      .$name('fn1');
    const fn2 = fn([])
      .does('() { fn1(); }')
      .$uses({ fn1 })
      .$name('fn2')
      .with(slotC, slotD);
    const fn3 = fn([])
      .does('() { fn2(); }')
      .$uses({ fn2 })
      .$name('fn3')
      .with(slotB, slotC);
    const fn4 = fn([])
      .does('() { fn3(); }')
      .$uses({ fn3 })
      .$name('fn4')
      .with(slotA, slotB);
    const main = fn([]).does('() { fn4(); }').$uses({ fn4 }).$name('main');

    const actual = parseResolved({ main });
    const expected = parse(/* wgsl */ `
      fn fn1() { let value = 4; }
      fn fn2() { fn1(); }
      fn fn3() { fn2(); }
      fn fn4() { fn3(); }
      fn main() { fn4(); }
    `);

    expect(actual).toEqual(expected);
  });
});
