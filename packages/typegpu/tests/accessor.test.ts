import { describe, expect } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { it } from './utils/extendedIt.ts';
import { parse, parseResolved } from './utils/parseResolved.ts';

const RED = d.vec3f(1, 0, 0);
const RED_RESOLVED = 'vec3f(1, 0, 0)';

describe('tgpu.accessor', () => {
  it('resolves to invocation of provided function', () => {
    const colorAccess = tgpu['~unstable'].accessor(d.vec3f);

    const red = tgpu.fn([], d.vec3f)(`() { return ${RED}; }`).$uses({ RED });

    const getColor = tgpu.fn([], d.vec3f)`() { return colorAccess; }`
      .$uses({ colorAccess })
      .with(colorAccess, red);

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
    const colorAccess = tgpu['~unstable'].accessor(d.vec3f);

    const redUniform = root
      .createBuffer(d.vec3f, RED)
      .$usage('uniform')
      .as('uniform');

    const getColor = tgpu.fn([], d.vec3f)`() { return colorAccess; }`
      .$uses({ colorAccess })
      .with(colorAccess, redUniform);

    expect(parseResolved({ getColor })).toBe(
      parse(/* wgsl */ `
        @group(0) @binding(0) var<uniform> redUniform: vec3f;

        fn getColor() -> vec3f {
          return redUniform;
        }
    `),
    );
  });

  it('resolves to resolved form of provided JS value', () => {
    const colorAccess = tgpu['~unstable'].accessor(d.vec3f);
    const multiplierAccess = tgpu['~unstable'].accessor(d.f32);

    const getColor = tgpu.fn([], d.vec3f)`() {
        return colorAccess * multiplierAccess;
      }`
      .$uses({ colorAccess, multiplierAccess })
      .with(colorAccess, RED)
      .with(multiplierAccess, 2);

    expect(parseResolved({ getColor })).toBe(
      parse(/* wgsl */ `
        fn getColor() -> vec3f {
          return ${RED_RESOLVED} * 2;
        }
    `),
    );
  });

  it('resolves to default value if no value provided', () => {
    const colorAccess = tgpu['~unstable'].accessor(d.vec3f, RED); // red by default

    const getColor = tgpu.fn([], d.vec3f)`() { return colorAccess; }`
      .$uses({ colorAccess });

    expect(parseResolved({ getColor })).toBe(
      parse(/* wgsl */ `
      fn getColor() -> vec3f {
        return ${RED_RESOLVED};
      }
    `),
    );
  });

  it('resolves to provided value rather than default value', () => {
    const colorAccess = tgpu['~unstable'].accessor(d.vec3f, RED); // red by default

    const getColor = tgpu.fn([], d.vec3f)`() { return colorAccess; }`
      .$uses({ colorAccess });

    // overriding to green
    const getColorWithGreen = getColor.with(colorAccess, d.vec3f(0, 1, 0));

    const main = tgpu.fn([])(`() {
        return getColorWithGreen();
      }`)
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
    const colorAccess = tgpu['~unstable'].accessor(d.vec3f).$name('color');

    const getColor = tgpu.fn([], d.vec3f)`() { return colorAccess; }`
      .$uses({ colorAccess });

    expect(() => tgpu.resolve({ externals: { getColor }, names: 'strict' }))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed: 
        - <root>
        - fn:getColor
        - accessor:color: Missing value for 'slot:color']
      `);
  });

  it('resolves in tgsl functions, using .value', ({ root }) => {
    const redUniform = root
      .createBuffer(d.vec3f, RED)
      .$usage('uniform')
      .as('uniform');

    const colorValueAccess = tgpu['~unstable'].accessor(d.vec3f, RED);
    const colorUsageAccess = tgpu['~unstable'].accessor(d.vec3f, redUniform);

    const getColor = tgpu.fn([], d.vec3f)(() => RED);
    const colorAccessorFn = tgpu['~unstable'].accessor(d.vec3f, getColor);

    const main = tgpu.fn([])(() => {
      const color = colorValueAccess.value;
      const color2 = colorUsageAccess.value;
      const color3 = colorAccessorFn.value;

      const colorX = colorValueAccess.value.x;
      const color2X = colorUsageAccess.value.x;
      const color3X = colorAccessorFn.value.x;
    });

    const resolved = tgpu.resolve({
      externals: { main },
      names: 'strict',
    });

    expect(parse(resolved)).toBe(
      parse(/* wgsl */ `
        @group(0) @binding(0) var<uniform> redUniform: vec3f;

        fn getColor() -> vec3f {
          return vec3f(1, 0, 0);
        }

        fn main() {
          var color = vec3f(1, 0, 0);
          var color2 = redUniform;
          var color3 = getColor();

          var colorX = vec3f(1, 0, 0).x;
          var color2X = redUniform.x;
          var color3X = getColor().x;
        }
    `),
    );
  });
});
