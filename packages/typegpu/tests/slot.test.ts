import { describe, expect } from 'vitest';
import tgpu, { d, std } from '../src/index.js';
import { it } from './utils/extendedIt.ts';
import { getName } from '../src/shared/meta.ts';

const RED = 'vec3f(1., 0., 0.)';
const GREEN = 'vec3f(0., 1., 0.)';

describe('tgpu.slot', () => {
  it('resolves to default value if no value provided', () => {
    const colorSlot = tgpu.slot(RED); // red by default

    const getColor = tgpu.fn([], d.vec3f)`() {
      return colorSlot;
    }`
      .$uses({ colorSlot });

    expect(tgpu.resolve([getColor])).toMatchInlineSnapshot(`
      "fn getColor() -> vec3f{
            return vec3f(1., 0., 0.);
          }"
    `);
  });

  it('resolves to provided value rather than default value', () => {
    const colorSlot = tgpu.slot(RED); // red by default

    const getColor = tgpu.fn([], d.vec3f)`() {
      return colorSlot;
    }`
      .$uses({ colorSlot });

    // overriding to green
    const getColorWithGreen = getColor.with(colorSlot, GREEN);

    const main = tgpu.fn([])(`() {
      getColorWithGreen();
    }`)
      .$uses({ getColorWithGreen });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn getColor() -> vec3f{
            return vec3f(0., 1., 0.);
          }

      fn main() {
            getColor();
          }"
    `);
  });

  it('resolves to provided value', () => {
    const colorSlot = tgpu.slot<string>(); // no default

    const getColor = tgpu.fn([], d.vec3f)`() {
        return colorSlot;
      }`
      .$uses({ colorSlot });

    // overriding to green
    const getColorWithGreen = getColor.with(colorSlot, 'vec3f(0., 1., 0.)');

    const main = tgpu.fn([])`() {
        getColorWithGreen();
      }`
      .$uses({ getColorWithGreen });

    // should be green
    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn getColor() -> vec3f{
              return vec3f(0., 1., 0.);
            }

      fn main() {
              getColor();
            }"
    `);
  });

  it('throws error when no default nor value provided', () => {
    const colorSlot = tgpu.slot<string>().$name('color');

    const getColor = tgpu.fn([], d.vec3f)`() {
        return colorSlot;
      }`
      .$uses({ colorSlot });

    expect(() => tgpu.resolve([getColor]))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn:getColor
        - slot:color: Missing value for 'slot:color']
      `);
  });

  it('prefers closer scope', () => {
    const colorSlot = tgpu.slot<string>(); // no default

    const getColor = tgpu.fn([], d.vec3f)`() -> vec3f {
      return colorSlot;
    }`
      .$uses({ colorSlot });

    const getColorWithRed = getColor.with(colorSlot, RED);
    const getColorWithGreen = getColor.with(colorSlot, GREEN);

    const wrapper = tgpu.fn([])`() {
      return getColorWithGreen();
    }`
      .$uses({ getColorWithGreen })
      .with(colorSlot, RED);

    const main = tgpu.fn([])`() {
      getColorWithRed();
      wrapper();
    }`
      .$uses({ getColorWithRed, wrapper });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn getColor() -> vec3f{
            return vec3f(1., 0., 0.);
          }

      fn getColor_1() -> vec3f{
            return vec3f(0., 1., 0.);
          }

      fn wrapper() {
            return getColor_1();
          }

      fn main() {
            getColor();
            wrapper();
          }"
    `);
  });

  it('reuses common nested functions', () => {
    const sizeSlot = tgpu.slot<1 | 100>();
    const colorSlot = tgpu.slot<typeof RED | typeof GREEN>();

    const getSize = tgpu.fn([], d.f32)`() { return sizeSlot; }`
      .$uses({ sizeSlot });

    const getColor = tgpu.fn([], d.vec3f)`() -> vec3f { return colorSlot; }`
      .$uses({ colorSlot });

    const sizeAndColor = tgpu.fn([])`() {
        getSize();
        getColor();
      }`
      .$uses({ getSize, getColor });

    const wrapper = tgpu
      .fn([])`() {
        sizeAndColor();
      }`
      .$uses({ sizeAndColor });

    const wrapperWithSmallRed = wrapper
      .with(sizeSlot, 1)
      .with(colorSlot, RED);
    const wrapperWithBigRed = wrapper
      .with(sizeSlot, 100)
      .with(colorSlot, RED);
    const wrapperWithSmallGreen = wrapper
      .with(sizeSlot, 1)
      .with(colorSlot, GREEN);
    const wrapperWithBigGreen = wrapper
      .with(sizeSlot, 100)
      .with(colorSlot, GREEN);

    const main = tgpu.fn([])`() {
        wrapperWithSmallRed();
        wrapperWithBigRed();
        wrapperWithSmallGreen();
        wrapperWithBigGreen();
      }`
      .$uses({
        wrapperWithSmallRed,
        wrapperWithBigRed,
        wrapperWithSmallGreen,
        wrapperWithBigGreen,
      })
      .$name('main');

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn getSize() -> f32{ return 1; }

      fn getColor() -> vec3f{ return vec3f(1., 0., 0.); }

      fn sizeAndColor() {
              getSize();
              getColor();
            }

      fn wrapper() {
              sizeAndColor();
            }

      fn getSize_1() -> f32{ return 100; }

      fn sizeAndColor_1() {
              getSize_1();
              getColor();
            }

      fn wrapper_1() {
              sizeAndColor_1();
            }

      fn getColor_1() -> vec3f{ return vec3f(0., 1., 0.); }

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
            }"
    `);
  });

  it('unwraps layers of slots', () => {
    const slotA = tgpu.slot(1);
    const slotB = tgpu.slot(2);
    const slotC = tgpu.slot(3);
    const slotD = tgpu.slot(4);

    const fn1 = tgpu.fn([])`() { let value = slotA; }`
      .$uses({ slotA });
    const fn2 = tgpu.fn([])`() { fn1(); }`
      .$uses({ fn1 })
      .with(slotC, slotD);
    const fn3 = tgpu.fn([])`() { fn2(); }`
      .$uses({ fn2 })
      .with(slotB, slotC);
    const fn4 = tgpu.fn([])`() { fn3(); }`
      .$uses({ fn3 })
      .with(slotA, slotB);
    const main = tgpu.fn([])`() { fn4(); }`
      .$uses({ fn4 });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn fn1() { let value = 4; }

      fn fn2() { fn1(); }

      fn fn3() { fn2(); }

      fn fn4() { fn3(); }

      fn main() { fn4(); }"
    `);
  });

  it('allows access to value in tgsl functions through the .$ property ', ({ root }) => {
    const vectorSlot = tgpu.slot(d.vec3f(1, 2, 3));
    const Boid = d.struct({
      pos: d.vec3f,
      vel: d.vec3u,
    });

    const buffer = root.createBuffer(Boid).$usage('uniform').$name('boid');
    const uniform = buffer.as('uniform');
    const uniformSlot = tgpu.slot(uniform);
    const uniformSlotSlot = tgpu.slot(uniformSlot);

    const getColor = tgpu.fn([], d.vec3f)(() => d.vec3f(1, 2, 3));
    const colorAccess = tgpu.accessor(d.vec3f, getColor);
    const colorAccessSlot = tgpu.slot(colorAccess);

    const func = tgpu.fn([])(() => {
      const pos = vectorSlot.$;
      const posX = vectorSlot.$.x;
      const vel = uniformSlot.$.vel;
      const velX = uniformSlot.$.vel.x;

      const vel_ = uniformSlotSlot.$.vel;
      const velX_ = uniformSlotSlot.$.vel.x;

      const color = colorAccessSlot.$;
    });

    expect(tgpu.resolve([func])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
        vel: vec3u,
      }

      @group(0) @binding(0) var<uniform> boid: Boid;

      fn getColor() -> vec3f {
        return vec3f(1, 2, 3);
      }

      fn func() {
        var pos = vec3f(1, 2, 3);
        const posX = 1f;
        let vel = (&boid.vel);
        let velX = boid.vel.x;
        let vel_ = (&boid.vel);
        let velX_ = boid.vel.x;
        var color = getColor();
      }"
    `);
  });

  it('participates in constant folding', () => {
    // User-configurable
    const gammaCorrectionSlot = tgpu.slot(false);
    // ---

    // Core shader
    const main = tgpu.fn([d.vec2f], d.vec3f)((uv) => {
      let color = d.vec3f(1, 0, 1);

      if (gammaCorrectionSlot.$) {
        color = std.pow(color, d.vec3f(1 / 2.2));
      }

      return color;
    });

    // Gamma Correction: OFF
    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main(uv: vec2f) -> vec3f {
        var color = vec3f(1, 0, 1);
        return color;
      }"
    `);

    // Gamma Correction: ON
    expect(tgpu.resolve([main.with(gammaCorrectionSlot, true)]))
      .toMatchInlineSnapshot(`
      "fn main(uv: vec2f) -> vec3f {
        var color = vec3f(1, 0, 1);
        {
          color = pow(color, vec3f(0.4545454680919647));
        }
        return color;
      }"
    `);
  });

  it('includes slot bindings in toString', () => {
    const firstSlot = tgpu.slot<number>();
    const secondSlot = tgpu.slot<number>();
    const thirdSlot = tgpu.slot<number>();

    const getSize = tgpu.fn([], d.f32)(() =>
      firstSlot.$ + secondSlot.$ + thirdSlot.$
    )
      .with(firstSlot, 1)
      .with(secondSlot, 2)
      .with(thirdSlot, 3);

    expect(getSize.toString()).toMatchInlineSnapshot(
      `"fn:getSize[firstSlot=1, secondSlot=2, thirdSlot=3]"`,
    );
  });

  it('safe stringifies in toString', () => {
    const slot = tgpu.slot<d.v4f>();

    const getSize = tgpu.fn([], d.f32)(() => slot.$.x)
      .with(slot, d.vec4f(1, 2, 3, 4));

    expect(getSize.toString()).toMatchInlineSnapshot(
      `"fn:getSize[slot=vec4f(1, 2, 3, 4)]"`,
    );
  });

  it('sets names only for bound functions', () => {
    const colorSlot = tgpu.slot<d.v3f>();

    const getColor = tgpu.fn([], d.vec3f)(() => colorSlot.$).$name('colorFn');
    const getRed = getColor.with(colorSlot, d.vec3f(1, 0, 0)).$name('redFn');
    const getBlue = getColor.with(colorSlot, d.vec3f(0, 0, 1)).$name('blueFn');

    expect(getName(getColor)).toBe('colorFn');
    expect(getName(getRed)).toBe('redFn');
    expect(getName(getBlue)).toBe('blueFn');
  });

  it('uses bound name for code generation', () => {
    const colorSlot = tgpu.slot<d.v3f>(d.vec3f(0, 0, 0));

    const getColor = tgpu.fn([], d.vec3f)(() => colorSlot.$).$name('colorFn');
    const getRed = getColor.with(colorSlot, d.vec3f(1, 0, 0)).$name('redFn');
    const getBlue = getColor.with(colorSlot, d.vec3f(0, 0, 1)).$name('blueFn');

    const main = () => {
      'use gpu';
      getColor();
      getRed();
      getBlue();
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn colorFn() -> vec3f {
        return vec3f();
      }

      fn redFn() -> vec3f {
        return vec3f(1, 0, 0);
      }

      fn blueFn() -> vec3f {
        return vec3f(0, 0, 1);
      }

      fn main() {
        colorFn();
        redFn();
        blueFn();
      }"
    `);
  });
});
