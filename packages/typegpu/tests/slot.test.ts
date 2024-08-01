import { describe, expect, it } from 'vitest';
import { MissingSlotValueError, StrictNameRegistry, wgsl } from '../src';
import { ResolutionCtxImpl } from '../src/resolutionCtx';
import { parseWGSL } from './utils/parseWGSL';

const RED = 'vec3f(1., 0., 0.)';
const GREEN = 'vec3f(0., 1., 0.)';

describe('wgsl.slot', () => {
  it('resolves to default value if no value provided', () => {
    const colorSlot = wgsl.slot(RED).$name('color'); // red by default

    const actual = wgsl`
      fn get_color() {
        return ${colorSlot};
      }
    `;

    const expected = wgsl`
      fn get_color() {
        return ${RED};
      }
    `;

    expect(parseWGSL(actual)).toEqual(parseWGSL(expected));
  });

  it('resolves to provided value rather than default value', () => {
    const colorSlot = wgsl.slot(RED).$name('color'); // red by default

    const getColor = wgsl.fn`() {
      return ${colorSlot};
    }`.$name('get_color');

    // overriding to green
    const getColorWithGreen = getColor.with(colorSlot, GREEN);

    const actual = wgsl`
      fn main() {
        return ${getColorWithGreen}();
      }
    `;

    const expected = wgsl`
      fn get_color() {
        return ${GREEN};
      }

      fn main() {
        return get_color();
      }
    `;

    expect(parseWGSL(actual)).toEqual(parseWGSL(expected));
  });

  it('resolves to provided value', () => {
    const colorSlot = wgsl.slot<string>().$name('color'); // no default

    const getColor = wgsl.fn`() {
      return ${colorSlot};
    }`.$name('get_color');

    // overriding to green
    const getColorWithGreen = getColor.with(colorSlot, 'vec3f(0., 1., 0.)');

    const program = wgsl`
      fn main() {
        return ${getColorWithGreen}();
      }`;

    // should be green
    expect(parseWGSL(program)).toEqual(
      parseWGSL(wgsl`
        fn get_color() {
          return vec3f(0., 1., 0.);
        }

        fn main() {
          return get_color();
        }
    `),
    );
  });

  it('throws error when no default nor value provided', () => {
    const colorSlot = wgsl.slot().$name('color');
    const ctx = new ResolutionCtxImpl({ names: new StrictNameRegistry() });

    const shader = wgsl`
    fn get_color() {
      return ${colorSlot};
    }
    `;

    expect(() => ctx.resolve(shader)).toThrowError(
      new MissingSlotValueError(colorSlot),
    );
  });

  it('prefers closer scope', () => {
    const colorSlot = wgsl.slot().$name('color'); // no default

    const getColor = wgsl.fn`() {
      return ${colorSlot};
    }`.$name('get_color');

    const getColorWithRed = getColor.with(colorSlot, RED);
    const getColorWithGreen = getColor.with(colorSlot, GREEN);

    const wrapperFn = wgsl.fn`() {
      return ${getColorWithGreen}();
    }`
      .$name('wrapper')
      .with(colorSlot, RED);

    const actual = wgsl`
      fn main() {
        ${getColorWithRed}();
        ${wrapperFn}();
      }
    `;

    const expected = wgsl`
      fn get_color() {
        return ${RED};
      }

      fn get_color_1() {
        return ${GREEN};
      }

      fn wrapper() {
        return get_color_1();
      }

      fn main() {
        get_color();
        wrapper();
      }
    `;

    expect(parseWGSL(actual)).toEqual(parseWGSL(expected));
  });

  it('reuses common nested functions', () => {
    const sizeSlot = wgsl.slot<1 | 100>().$name('size');
    const colorSlot = wgsl.slot<typeof RED | typeof GREEN>().$name('color');

    const sizeFn = wgsl.fn`() {
      return ${sizeSlot};
    }`.$name('get_size');

    const colorFn = wgsl.fn`() {
      return ${colorSlot};
    }`.$name('get_color');

    const sizeAndColorFn = wgsl.fn`() {
      ${sizeFn}();
      ${colorFn}();
    }`.$name('size_and_color');

    const wrapperFn = wgsl.fn`() {
      ${sizeAndColorFn}();
    }`.$name('wrapper');

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

    const actual = wgsl`
      fn main() {
        ${wrapperWithSmallRed}();
        ${wrapperWithBigRed}();
        ${wrapperWithSmallGreen}();
        ${wrapperWithBigGreen}();
      }
    `;

    const expected = wgsl`
      fn get_size() {
        return 1;
      }
      
      fn get_color() {
        return ${RED};
      }

      fn size_and_color() {
        get_size();
        get_color();
      }

      fn wrapper() {
        size_and_color();
      }

      fn get_size_1() {
        return 100;
      }

      fn size_and_color_1() {
        get_size_1();
        get_color();
      }

      fn wrapper_1() {
        size_and_color_1();
      }

      fn get_color_1() {
        return ${GREEN};
      }

      fn size_and_color_2() {
        get_size();
        get_color_1();
      }

      fn wrapper_2() {
        size_and_color_2();
      }

      fn size_and_color_3() {
        get_size_1();
        get_color_1();
      }

      fn wrapper_3() {
        size_and_color_3();
      }

      fn main() {
        wrapper();
        wrapper_1();
        wrapper_2();
        wrapper_3();
      }
    `;

    expect(parseWGSL(actual)).toEqual(parseWGSL(expected));
  });

  it('unwraps layers of slots', () => {
    const slotA = wgsl.slot<number>(1).$name('a');
    const slotB = wgsl.slot<number>(2).$name('b');
    const slotC = wgsl.slot<number>(3).$name('c');
    const slotD = wgsl.slot<number>(4).$name('d');

    const fn1 = wgsl.fn`() { let value = ${slotA}; }`.$name('fn1');
    const fn2 = wgsl.fn`() { ${fn1}(); }`.$name('fn2').with(slotC, slotD);
    const fn3 = wgsl.fn`() { ${fn2}(); }`.$name('fn3').with(slotB, slotC);
    const fn4 = wgsl.fn`() { ${fn3}(); }`.$name('fn4').with(slotA, slotB);

    const actual = wgsl`fn main() { ${fn4}(); }`;

    const expected = wgsl`
      fn fn1() { let value = 4; }
      fn fn2() { fn1(); }
      fn fn3() { fn2(); }
      fn fn4() { fn3(); }
      fn main() { fn4(); }
    `;

    expect(parseWGSL(actual)).toEqual(parseWGSL(expected));
  });
});
