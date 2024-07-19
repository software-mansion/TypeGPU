import { describe, expect, it } from 'vitest';
import { MissingBindingError, StrictNameRegistry, wgsl } from '../src';
import { ResolutionCtxImpl } from '../src/resolutionCtx';
import { parseWGSL } from './utils/parseWGSL';

const RED = 'vec3f(1., 0., 0.)';
const GREEN = 'vec3f(0., 1., 0.)';

describe('wgsl.slot', () => {
  it('resolves to default value if no binding provided', () => {
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

  it('resolves to binding rather than default value', () => {
    const colorSlot = wgsl.slot(RED).$name('color'); // red by default

    const getColor = wgsl.fn('get_color')`() {
      return ${colorSlot};
    }`;

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

  it('resolves to binding', () => {
    const colorSlot = wgsl.slot<string>().$name('color'); // no default

    const getColor = wgsl.fn('get_color')`() {
      return ${colorSlot};
    }`;

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

  it('throws error when no default nor binding provided', () => {
    const colorSlot = wgsl.slot().$name('color');
    const ctx = new ResolutionCtxImpl({ names: new StrictNameRegistry() });

    const shader = wgsl`
    fn get_color() {
      return ${colorSlot};
    }
    `;

    expect(() => ctx.resolve(shader)).toThrowError(
      new MissingBindingError(colorSlot),
    );
  });

  it('prefers closer binding', () => {
    const colorSlot = wgsl.slot().$name('color'); // no default

    const getColor = wgsl.fn('get_color')`() {
      return ${colorSlot};
    }`;

    const getColorWithRed = getColor.with(colorSlot, RED);
    const getColorWithGreen = getColor.with(colorSlot, GREEN);

    const wrapperFn = wgsl.fn('wrapper')`() {
      return ${getColorWithGreen}();
    }`.with(colorSlot, RED);

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

    const sizeFn = wgsl.fn('get_size')`() {
      return ${sizeSlot};
    }`;

    const colorFn = wgsl.fn('get_color')`() {
      return ${colorSlot};
    }`;

    const sizeAndColorFn = wgsl.fn('size_and_color')`() {
      ${sizeFn}();
      ${colorFn}();
    }`;

    const wrapperFn = wgsl.fn('wrapper')`() {
      ${sizeAndColorFn}();
    }`;

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
});
