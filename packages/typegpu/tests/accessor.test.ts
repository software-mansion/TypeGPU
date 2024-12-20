import { parse } from 'tgpu-wgsl-parser';
import { describe, expect } from 'vitest';
import * as d from '../src/data';
import tgpu, {
  MissingSlotValueError,
  ResolutionError,
  asUniform,
} from '../src/experimental';
import type { TgpuResolvable } from '../src/types';
import { it } from './utils/extendedIt';
import { parseResolved } from './utils/parseResolved';

const RED = d.vec3f(1, 0, 0);
const RED_RESOLVED = 'vec3f(1, 0, 0)';

const resolutionRootMock = {
  toString() {
    return '<root>';
  },
} as TgpuResolvable;

describe('tgpu.accessor', () => {
  it('resolves to invokation of provided function', () => {
    const colorAccessor = tgpu.accessor(d.vec3f).$name('color');

    const getColor = tgpu
      .fn([], d.vec3f)
      .does(/* wgsl */ `() -> vec3f {
        return color;
      }`)
      .$name('getColor')
      .$uses({ color: colorAccessor })
      .with(
        colorAccessor,
        tgpu
          .fn([], d.vec3f)
          .does(`() -> vec3f { return ${RED_RESOLVED}; }`)
          .$name('red'),
      );

    expect(parseResolved(getColor)).toEqual(
      parse(/* wgsl */ `
        fn red() -> vec3f {
          return ${RED_RESOLVED};
        }

        fn getColor() -> vec3f {
          return red();
        }
    `),
    );
  });

  it('resolves to provided buffer usage', ({ root }) => {
    const colorAccessor = tgpu.accessor(d.vec3f).$name('color');

    const getColor = tgpu
      .fn([], d.vec3f)
      .does(/* wgsl */ `() -> vec3f {
        return color;
      }`)
      .$name('getColor')
      .$uses({ color: colorAccessor })
      .with(
        colorAccessor,
        asUniform(
          root.createBuffer(d.vec3f, RED).$usage('uniform').$name('red'),
        ),
      );

    expect(parseResolved(getColor)).toEqual(
      parse(/* wgsl */ `
        @group(0) @binding(0) var<uniform> red: vec3f;

        fn getColor() -> vec3f {
          return red;
        }
    `),
    );
  });

  it('resolves to resolved form of provided JS value', ({ root }) => {
    const colorAccessor = tgpu.accessor(d.vec3f).$name('color');

    const getColor = tgpu
      .fn([], d.vec3f)
      .does(/* wgsl */ `() -> vec3f {
        return color;
      }`)
      .$name('getColor')
      .$uses({ color: colorAccessor })
      .with(colorAccessor, RED);

    expect(parseResolved(getColor)).toEqual(
      parse(/* wgsl */ `
        fn getColor() -> vec3f {
          return ${RED_RESOLVED};
        }
    `),
    );
  });

  it('resolves to default value if no value provided', () => {
    const colorAccessor = tgpu.accessor(d.vec3f, RED).$name('color'); // red by default

    const getColor = tgpu
      .fn([], d.vec3f)
      .does(/* wgsl */ `() -> vec3f {
        return color;
      }`)
      .$name('getColor')
      .$uses({ color: colorAccessor });

    expect(parseResolved(getColor)).toEqual(
      parse(/* wgsl */ `
      fn getColor() -> vec3f {
        return ${RED_RESOLVED};
      }
    `),
    );
  });

  it('resolves to provided value rather than default value', () => {
    const colorAccessor = tgpu.accessor(d.vec3f, RED).$name('color'); // red by default

    const getColor = tgpu
      .fn([], d.vec3f)
      .does(/* wgsl */ `() -> vec3f {
        return color;
      }`)
      .$name('getColor')
      .$uses({ color: colorAccessor });

    // overriding to green
    const getColorWithGreen = getColor.with(colorAccessor, d.vec3f(0, 1, 0));

    const main = tgpu
      .fn([])
      .does(`() {
        return getColorWithGreen();
      }`)
      .$name('main')
      .$uses({ getColorWithGreen });

    expect(parseResolved(main)).toEqual(
      parse(/* wgsl */ `
        fn getColor() -> vec3f {
          return vec3f(0, 1, 0);
        }

        fn main() {
          return getColor();
        }
    `),
    );
  });

  it('throws error when no default nor value provided', () => {
    const colorAccessor = tgpu.accessor(d.vec3f).$name('color');

    const getColor = tgpu
      .fn([], d.vec3f)
      .does(`() {
        return color;
      })`)
      .$name('getColor')
      .$uses({ color: colorAccessor });

    expect(() => tgpu.resolve({ input: getColor, names: 'strict' })).toThrow(
      new ResolutionError(new MissingSlotValueError(colorAccessor.slot), [
        resolutionRootMock,
        getColor,
        colorAccessor,
      ]),
    );
  });
});
