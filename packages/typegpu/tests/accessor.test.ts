import { describe, expect } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { it } from './utils/extendedIt.ts';

const RED = d.vec3f(1, 0, 0);
const RED_RESOLVED = 'vec3f(1, 0, 0)';

describe('tgpu.accessor', () => {
  it('resolves to invocation of provided function', () => {
    const colorAccess = tgpu['~unstable'].accessor(d.vec3f);

    const red = tgpu.fn([], d.vec3f)('() { return RED; }').$uses({ RED });

    const getColor = tgpu.fn([], d.vec3f)`() { return colorAccess; }`
      .$uses({ colorAccess })
      .with(colorAccess, red);

    expect(tgpu.resolve([getColor])).toMatchInlineSnapshot(`
      "fn red() -> vec3f{ return vec3f(1, 0, 0); }

      fn getColor() -> vec3f{ return red(); }"
    `);
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

    expect(tgpu.resolve([getColor])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> redUniform: vec3f;

      fn getColor() -> vec3f{ return redUniform; }"
    `);
  });

  it('resolves to resolved form of provided JS value', () => {
    const colorAccess = tgpu['~unstable'].accessor(d.vec3f);
    const multiplierAccess = tgpu['~unstable'].accessor(d.f32);

    const getColor = tgpu.fn(
      [],
      d.vec3f,
    )`() { return colorAccess * multiplierAccess; }`
      .$uses({ colorAccess, multiplierAccess })
      .with(colorAccess, RED)
      .with(multiplierAccess, 2);

    expect(tgpu.resolve([getColor])).toMatchInlineSnapshot(
      `"fn getColor() -> vec3f{ return vec3f(1, 0, 0) * 2f; }"`,
    );
  });

  it('resolves to default value if no value provided', () => {
    const colorAccess = tgpu['~unstable'].accessor(d.vec3f, RED); // red by default

    const getColor = tgpu.fn([], d.vec3f)`() { return colorAccess; }`
      .$uses({ colorAccess });

    expect(tgpu.resolve([getColor])).toMatchInlineSnapshot(
      `"fn getColor() -> vec3f{ return vec3f(1, 0, 0); }"`,
    );
  });

  it('resolves to provided value rather than default value', () => {
    const colorAccess = tgpu['~unstable'].accessor(d.vec3f, RED); // red by default

    const getColor = tgpu.fn([], d.vec3f)`() { return colorAccess; }`
      .$uses({ colorAccess });

    // overriding to green
    const getColorWithGreen = getColor.with(colorAccess, d.vec3f(0, 1, 0));

    const main = tgpu.fn([])`() { return getColorWithGreen(); }`
      .$uses({ getColorWithGreen });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn getColor() -> vec3f{ return vec3f(0, 1, 0); }

      fn main() { return getColor(); }"
    `);
  });

  it('throws error when no default nor value provided', () => {
    const colorAccess = tgpu['~unstable'].accessor(d.vec3f).$name('color');

    const getColor = tgpu.fn([], d.vec3f)`() { return colorAccess; }`
      .$uses({ colorAccess });

    expect(() => tgpu.resolve([getColor]))
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

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> redUniform: vec3f;

      fn getColor() -> vec3f {
        return vec3f(1, 0, 0);
      }

      fn main() {
        var color = vec3f(1, 0, 0);
        let color2 = (&redUniform);
        var color3 = getColor();
        const colorX = 1f;
        let color2X = redUniform.x;
        let color3X = getColor().x;
      }"
    `);
  });

  it('retains type information', () => {
    // Typed as f32, but literal could be automatically inferred as an i32
    const fooAccess = tgpu['~unstable'].accessor(d.f32, 1);

    const main = tgpu.fn([])(() => {
      const foo = fooAccess.$;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        const foo = 1f;
      }"
    `);
  });
});
