import { describe, expect } from 'vitest';
import tgpu from '../src/index.ts';
import * as d from '../src/data/index.ts';
import { it } from './utils/extendedIt.ts';
import { parse } from './utils/parseResolved.ts';
import { parseResolved } from './utils/parseResolved.ts';

const RED = 'vec3f(1., 0., 0.)';
const GREEN = 'vec3f(0., 1., 0.)';

describe('tgpu.slot', () => {
  it('resolves to default value if no value provided', () => {
    const colorSlot = tgpu['~unstable'].slot(RED).$name('color'); // red by default

    const getColor = tgpu['~unstable']
      .fn(
        [],
        d.vec3f,
      )(/* wgsl */ `() -> vec3f {
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
    const colorSlot = tgpu['~unstable'].slot(RED).$name('color'); // red by default

    const getColor = tgpu['~unstable']
      .fn(
        [],
        d.vec3f,
      )(/* wgsl */ `() -> vec3f {
        return colorSlot;
      }`)
      .$name('getColor')
      .$uses({ colorSlot });

    // overriding to green
    const getColorWithGreen = getColor.with(colorSlot, GREEN);

    const main = tgpu['~unstable']
      .fn([])(`() {
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
    const colorSlot = tgpu['~unstable'].slot<string>().$name('color'); // no default

    const getColor = tgpu['~unstable']
      .fn(
        [],
        d.vec3f,
      )(/* wgsl */ `() {
        return colorSlot;
      }`)
      .$name('getColor')
      .$uses({ colorSlot });

    // overriding to green
    const getColorWithGreen = getColor.with(colorSlot, 'vec3f(0., 1., 0.)');

    const main = tgpu['~unstable']
      .fn([])(/* wgsl */ `() {
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
    const colorSlot = tgpu['~unstable'].slot<string>().$name('color');

    const getColor = tgpu['~unstable']
      .fn(
        [],
        d.vec3f,
      )(`() {
        return colorSlot;
      })`)
      .$name('getColor')
      .$uses({ colorSlot });

    expect(() =>
      tgpu.resolve({ externals: { getColor }, names: 'strict' }),
    ).toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed: 
        - <root>
        - fn:getColor
        - slot:color: Missing value for 'slot:color']
      `);
  });

  it('prefers closer scope', () => {
    const colorSlot = tgpu['~unstable'].slot<string>().$name('color'); // no default

    const getColor = tgpu['~unstable']
      .fn(
        [],
        d.vec3f,
      )(/* wgsl */ `() -> vec3f {
        return colorSlot;
      }`)
      .$name('getColor')
      .$uses({ colorSlot });

    const getColorWithRed = getColor.with(colorSlot, RED);
    const getColorWithGreen = getColor.with(colorSlot, GREEN);

    const wrapperFn = tgpu['~unstable']
      .fn([])(/* wgsl */ `() {
      return getColorWithGreen();
    }`)
      .$uses({ getColorWithGreen })
      .$name('wrapper')
      .with(colorSlot, RED);

    const main = tgpu['~unstable']
      .fn([])(/* wgsl */ `() {
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
    const sizeSlot = tgpu['~unstable'].slot<1 | 100>().$name('size');
    const colorSlot = tgpu['~unstable']
      .slot<typeof RED | typeof GREEN>()
      .$name('color');

    const getSize = tgpu['~unstable']
      .fn(
        [],
        d.f32,
      )(/* wgsl */ `() -> f32 {
        return sizeSlot;
      }`)
      .$uses({ sizeSlot })
      .$name('getSize');

    const getColor = tgpu['~unstable']
      .fn(
        [],
        d.vec3f,
      )(/* wgsl */ `() -> vec3f {
        return colorSlot;
      }`)
      .$uses({ colorSlot })
      .$name('getColor');

    const sizeAndColor = tgpu['~unstable']
      .fn([])(`() {
        getSize();
        getColor();
      }`)
      .$uses({ getSize, getColor })
      .$name('sizeAndColor');

    const wrapperFn = tgpu['~unstable']
      .fn([])(`() {
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

    const main = tgpu['~unstable']
      .fn([])(`() {
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
    const slotA = tgpu['~unstable'].slot(1).$name('a');
    const slotB = tgpu['~unstable'].slot(2).$name('b');
    const slotC = tgpu['~unstable'].slot(3).$name('c');
    const slotD = tgpu['~unstable'].slot(4).$name('d');

    const fn1 = tgpu['~unstable']
      .fn([])('() { let value = slotA; }')
      .$uses({ slotA })
      .$name('fn1');
    const fn2 = tgpu['~unstable']
      .fn([])('() { fn1(); }')
      .$uses({ fn1 })
      .$name('fn2')
      .with(slotC, slotD);
    const fn3 = tgpu['~unstable']
      .fn([])('() { fn2(); }')
      .$uses({ fn2 })
      .$name('fn3')
      .with(slotB, slotC);
    const fn4 = tgpu['~unstable']
      .fn([])('() { fn3(); }')
      .$uses({ fn3 })
      .$name('fn4')
      .with(slotA, slotB);
    const main = tgpu['~unstable']
      .fn([])('() { fn4(); }')
      .$uses({ fn4 })
      .$name('main');

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

  it('allows access to value in tgsl functions through the .value property ', ({
    root,
  }) => {
    const vectorSlot = tgpu['~unstable'].slot(d.vec3f(1, 2, 3));
    const Boid = d
      .struct({
        pos: d.vec3f,
        vel: d.vec3u,
      })
      .$name('Boid');

    const buffer = root.createBuffer(Boid).$usage('uniform').$name('boid');
    const uniform = buffer.as('uniform');
    const uniformSlot = tgpu['~unstable'].slot(uniform);
    const uniformSlotSlot = tgpu['~unstable'].slot(uniformSlot);

    const colorAccessorFn = tgpu['~unstable'].accessor(
      d.vec3f,
      tgpu['~unstable']
        .fn(
          [],
          d.vec3f,
        )(() => d.vec3f(1, 2, 3))
        .$name('getColor'),
    );
    const colorAccessorSlot = tgpu['~unstable'].slot(colorAccessorFn);

    const func = tgpu['~unstable'].fn([])(() => {
      const pos = vectorSlot.value;
      const posX = vectorSlot.value.x;
      const vel = uniformSlot.value.vel;
      const velX = uniformSlot.value.vel.x;

      const vel_ = uniformSlotSlot.value.vel;
      const velX_ = uniformSlotSlot.value.vel.x;

      const color = colorAccessorSlot.value;
    });

    const resolved = tgpu.resolve({
      externals: { func },
      names: 'strict',
    });

    expect(parse(resolved)).toEqual(
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
