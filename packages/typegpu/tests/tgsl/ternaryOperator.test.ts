import { describe, expect } from 'vitest';
import { it } from '../utils/extendedIt.ts';
import * as d from '../../src/data/index.ts';
import * as std from '../../src/std/index.ts';
import tgpu from '../../src/index.ts';

describe('ternary operator', () => {
  it('should resolve to one of the branches', () => {
    const mySlot = tgpu.slot<boolean>();
    const myFn = tgpu.fn([], d.u32)(() => {
      return mySlot.$ ? 10 : 20;
    });

    expect(
      tgpu.resolve([
        myFn.with(mySlot, true).$name('trueFn'),
        myFn.with(mySlot, false).$name('falseFn'),
      ]),
    )
      .toMatchInlineSnapshot(`
        "fn falseFn() -> u32 {
          return 10u;
        }

        fn falseFn_1() -> u32 {
          return 20u;
        }"
      `);
  });

  it('should work for different comptime known expressions', () => {
    const condition = true;
    const comptime = tgpu['~unstable'].comptime(() => true);
    const slot = tgpu.slot(true);
    const derived = tgpu['~unstable'].derived(() => slot.$);

    const myFn = tgpu.fn([])(() => {
      // biome-ignore lint/correctness/noConstantCondition: it's a test
      const a = true ? 1 : 0;
      const b = std.allEq(d.vec2f(1, 2), d.vec2f(1, 2)) ? 1 : 0;
      const c = condition ? 1 : 0;
      const dd = comptime() ? 1 : 0;
      const e = slot.$ ? 1 : 0;
      const f = derived.$ ? 1 : 0;
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() {
        const a = 1;
        const b = 1;
        const c = 1;
        const dd = 1;
        const e = 1;
        const f = 1;
      }"
    `);
  });

  it('should resolve nested operators', () => {
    const mySlot = tgpu.slot<number>(0);
    const myFn = tgpu.fn([], d.u32)(() => {
      return mySlot.$ === 1
        ? 10
        : mySlot.$ === 2
        ? 20
        : mySlot.$ === 3
        ? 30
        : -1;
    });

    expect(
      tgpu.resolve([
        myFn,
        myFn.with(mySlot, 1).$name('oneFn'),
        myFn.with(mySlot, 2).$name('twoFn'),
        myFn.with(mySlot, 3).$name('threeFn'),
      ]),
    )
      .toMatchInlineSnapshot(`
        "fn threeFn() -> u32 {
          return -1u;
        }

        fn threeFn_1() -> u32 {
          return 10u;
        }

        fn threeFn_2() -> u32 {
          return 20u;
        }

        fn threeFn_3() -> u32 {
          return 30u;
        }"
      `);
  });

  it('should not include unused dependencies', ({ root }) => {
    const mySlot = tgpu.slot<boolean>();
    const myUniform = root.createUniform(d.u32);
    const myReadonly = root.createReadonly(d.u32);

    const myFn = tgpu.fn([], d.u32)(() => {
      return mySlot.$ ? myUniform.$ : myReadonly.$;
    });

    expect(tgpu.resolve([myFn.with(mySlot, true).$name('trueFn')]))
      .toMatchInlineSnapshot(`
        "@group(0) @binding(0) var<uniform> myUniform: u32;

        fn trueFn() -> u32 {
          return myUniform;
        }"
      `);

    expect(tgpu.resolve([myFn.with(mySlot, false).$name('falseFn')]))
      .toMatchInlineSnapshot(`
        "@group(0) @binding(0) var<storage, read> myReadonly: u32;

        fn falseFn() -> u32 {
          return myReadonly;
        }"
      `);
  });

  it('should throw when test is not comptime known', () => {
    const myFn = tgpu.fn([d.u32], d.u32)((n) => {
      return n > 0 ? n : -n;
    });

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: AAA]
    `);
  });
});
