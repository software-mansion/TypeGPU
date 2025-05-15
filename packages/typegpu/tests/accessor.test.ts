import { describe, expect } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { it } from './utils/extendedIt.ts';
import { parse, parseResolved } from './utils/parseResolved.ts';

const RED = d.vec3f(1, 0, 0);
const RED_RESOLVED = 'vec3f(1, 0, 0)';

describe('tgpu.accessor', () => {
  it('resolves to invocation of provided function', () => {
    const colorAccessor = tgpu['~unstable'].accessor(d.vec3f).$name('color');

    const getColor = tgpu['~unstable']
      .fn([], d.vec3f)(/* wgsl */ `() -> vec3f {
        return color;
      }`)
      .$name('getColor')
      .$uses({ color: colorAccessor })
      .with(
        colorAccessor,
        tgpu['~unstable']
          .fn([], d.vec3f)(`() -> vec3f { return ${RED_RESOLVED}; }`)
          .$name('red'),
      );

    expect(parseResolved({ getColor })).toBe(
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
    const colorAccessor = tgpu['~unstable'].accessor(d.vec3f).$name('color');

    const getColor = tgpu['~unstable']
      .fn([], d.vec3f)(/* wgsl */ `() -> vec3f {
        return color;
      }`)
      .$name('getColor')
      .$uses({ color: colorAccessor })
      .with(
        colorAccessor,
        root
          .createBuffer(d.vec3f, RED)
          .$usage('uniform')
          .$name('red')
          .as('uniform'),
      );

    expect(parseResolved({ getColor })).toBe(
      parse(/* wgsl */ `
        @group(0) @binding(0) var<uniform> red: vec3f;

        fn getColor() -> vec3f {
          return red;
        }
    `),
    );
  });

  it('resolves to resolved form of provided JS value', () => {
    const colorAccessor = tgpu['~unstable'].accessor(d.vec3f).$name('color');
    const multiplierAccessor = tgpu['~unstable']
      .accessor(d.f32)
      .$name('multiplier');

    const getColor = tgpu['~unstable']
      .fn([], d.vec3f)(/* wgsl */ `() -> vec3f {
        return color * multiplier;
      }`)
      .$name('getColor')
      .$uses({ color: colorAccessor, multiplier: multiplierAccessor })
      .with(colorAccessor, RED)
      .with(multiplierAccessor, 2);

    expect(parseResolved({ getColor })).toBe(
      parse(/* wgsl */ `
        fn getColor() -> vec3f {
          return ${RED_RESOLVED} * 2;
        }
    `),
    );
  });

  it('resolves to default value if no value provided', () => {
    const colorAccessor = tgpu['~unstable']
      .accessor(d.vec3f, RED)
      .$name('color'); // red by default

    const getColor = tgpu['~unstable']
      .fn([], d.vec3f)(/* wgsl */ `() -> vec3f {
        return color;
      }`)
      .$name('getColor')
      .$uses({ color: colorAccessor });

    expect(parseResolved({ getColor })).toBe(
      parse(/* wgsl */ `
      fn getColor() -> vec3f {
        return ${RED_RESOLVED};
      }
    `),
    );
  });

  it('resolves to provided value rather than default value', () => {
    const colorAccessor = tgpu['~unstable']
      .accessor(d.vec3f, RED)
      .$name('color'); // red by default

    const getColor = tgpu['~unstable']
      .fn([], d.vec3f)(/* wgsl */ `() -> vec3f {
        return color;
      }`)
      .$name('getColor')
      .$uses({ color: colorAccessor });

    // overriding to green
    const getColorWithGreen = getColor.with(colorAccessor, d.vec3f(0, 1, 0));

    const main = tgpu['~unstable']
      .fn([])(`() {
        return getColorWithGreen();
      }`)
      .$name('main')
      .$uses({ getColorWithGreen });

    expect(parseResolved({ main })).toBe(
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
    const colorAccessor = tgpu['~unstable'].accessor(d.vec3f).$name('color');

    const getColor = tgpu['~unstable']
      .fn([], d.vec3f)(`() -> vec3f {
        return color;
      })`)
      .$name('getColor')
      .$uses({ color: colorAccessor });

    expect(() => tgpu.resolve({ externals: { getColor }, names: 'strict' }))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed: 
        - <root>
        - fn:getColor
        - accessor:color: Missing value for 'slot:color']
      `);
  });

  it('resolves in tgsl functions, using .value', ({ root }) => {
    const colorAccessorValue = tgpu['~unstable'].accessor(d.vec3f, RED);
    const colorAccessorUsage = tgpu['~unstable'].accessor(
      d.vec3f,
      root
        .createBuffer(d.vec3f, RED)
        .$usage('uniform')
        .$name('colorUniform')
        .as('uniform'),
    );

    const colorAccessorFn = tgpu['~unstable'].accessor(
      d.vec3f,
      tgpu['~unstable']
        .fn([], d.vec3f)(() => RED)
        .$name('getColor'),
    );

    const main = tgpu['~unstable']
      .fn([])(() => {
        const color = colorAccessorValue.value;
        const color2 = colorAccessorUsage.value;
        const color3 = colorAccessorFn.value;

        const colorX = colorAccessorValue.value.x;
        const color2X = colorAccessorUsage.value.x;
        const color3X = colorAccessorFn.value.x;
      })
      .$name('main');

    const resolved = tgpu.resolve({
      externals: { main },
      names: 'strict',
    });

    expect(parse(resolved)).toBe(
      parse(/* wgsl */ `
        @group(0) @binding(0) var<uniform> colorUniform: vec3f;

        fn getColor() -> vec3f {
          return vec3f(1, 0, 0);
        }

        fn main() {
          var color = vec3f(1, 0, 0);
          var color2 = colorUniform;
          var color3 = getColor();

          var colorX = vec3f(1, 0, 0).x;
          var color2X = colorUniform.x;
          var color3X = getColor().x;
        }
    `),
    );
  });
});
