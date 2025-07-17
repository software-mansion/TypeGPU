import { describe, expect } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { it } from './utils/extendedIt.ts';
import { parse, parseResolved } from './utils/parseResolved.ts';

const RED = 'vec3f(1., 0., 0.)';
const GREEN = 'vec3f(0., 1., 0.)';

describe('tgpu.slot', () => {
  it('resolves to default value if no value provided', () => {
    const colorSlot = tgpu.slot(RED); // red by default

    const getColor = tgpu.fn([], d.vec3f)`() {
        return colorSlot;
      }`
      .$uses({ colorSlot });

    const actual = parseResolved({ getColor });

    expect(actual).toBe(
      parse(`
      fn getColor() -> vec3f {
        return ${RED};
      }
    `),
    );
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
      .$name('main')
      .$uses({ getColorWithGreen });

    const actual = parseResolved({ main });
    expect(actual).toBe(
      parse(/* wgsl */ `
      fn getColor() -> vec3f {
        return ${GREEN};
      }

      fn main() {
        getColor();
      }
    `),
    );
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

    const actual = parseResolved({ main });

    // should be green
    expect(actual).toBe(
      parse(`
        fn getColor() -> vec3f {
          return vec3f(0., 1., 0.);
        }

        fn main() {
          getColor();
        }
    `),
    );
  });

  it('throws error when no default nor value provided', () => {
    const colorSlot = tgpu.slot<string>().$name('color');

    const getColor = tgpu.fn([], d.vec3f)`() {
        return colorSlot;
      }`
      .$uses({ colorSlot });

    expect(() => tgpu.resolve({ externals: { getColor }, names: 'strict' }))
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

    expect(actual).toBe(expected);
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

    expect(actual).toBe(expected);
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

    const actual = parseResolved({ main });
    const expected = parse(/* wgsl */ `
      fn fn1() { let value = 4; }
      fn fn2() { fn1(); }
      fn fn3() { fn2(); }
      fn fn4() { fn3(); }
      fn main() { fn4(); }
    `);

    expect(actual).toBe(expected);
  });

  it('allows access to value in tgsl functions through the .value property ', ({ root }) => {
    const vectorSlot = tgpu.slot(d.vec3f(1, 2, 3));
    const Boid = d
      .struct({
        pos: d.vec3f,
        vel: d.vec3u,
      })
      .$name('Boid');

    const buffer = root.createBuffer(Boid).$usage('uniform').$name('boid');
    const uniform = buffer.as('uniform');
    const uniformSlot = tgpu.slot(uniform);
    const uniformSlotSlot = tgpu.slot(uniformSlot);

    const getColor = tgpu.fn([], d.vec3f)(() => d.vec3f(1, 2, 3));
    const colorAccess = tgpu['~unstable'].accessor(d.vec3f, getColor);
    const colorAccessSlot = tgpu.slot(colorAccess);

    const func = tgpu.fn([])(() => {
      const pos = vectorSlot.value;
      const posX = vectorSlot.value.x;
      const vel = uniformSlot.value.vel;
      const velX = uniformSlot.value.vel.x;

      const vel_ = uniformSlotSlot.value.vel;
      const velX_ = uniformSlotSlot.value.vel.x;

      const color = colorAccessSlot.value;
    });

    const resolved = tgpu.resolve({
      externals: { func },
      names: 'strict',
    });

    expect(parse(resolved)).toBe(
      parse(`
        struct Boid {
          pos: vec3f,
          vel: vec3u,
        }

        @group(0) @binding(0) var<uniform> boid: Boid;

        fn getColor() -> vec3f {
          return vec3f(1, 2, 3);
        }

        fn func(){
          var pos = vec3f(1, 2, 3);
          var posX = 1;
          var vel = boid.vel;
          var velX = boid.vel.x;

          var vel_ = boid.vel;
          var velX_ = boid.vel.x;

          var color = getColor();
        }`),
    );
  });
});
