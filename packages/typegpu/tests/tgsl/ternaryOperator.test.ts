import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import tgpu, { d, std } from '../../src/index.js';

describe('ternary operator', () => {
  it('should resolve to one of the branches', () => {
    const mySlot = tgpu.slot<boolean>();
    const myFn = tgpu.fn(
      [],
      d.u32,
    )(() => {
      return mySlot.$ ? 10 : 20;
    });

    expect(
      tgpu.resolve([
        myFn.with(mySlot, true).$name('trueFn'),
        myFn.with(mySlot, false).$name('falseFn'),
      ]),
    ).toMatchInlineSnapshot(`
      "fn trueFn() -> u32 {
        return 10u;
      }

      fn falseFn() -> u32 {
        return 20u;
      }"
    `);
  });

  it('should work for different comptime known expressions', () => {
    const condition = true;
    const comptime = tgpu.comptime(() => true);
    const slot = tgpu.slot(true);
    const lazy = tgpu.lazy(() => slot.$);

    const myFn = tgpu.fn([])(() => {
      const a = true ? 1 : 0;
      const b = std.allEq(d.vec2f(1, 2), d.vec2f(1, 2)) ? 1 : 0;
      const c = condition ? 1 : 0;
      const dd = comptime() ? 1 : 0;
      const e = slot.$ ? 1 : 0;
      const f = lazy.$ ? 1 : 0;
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
    const myFn = tgpu.fn(
      [],
      d.u32,
    )(() => {
      return mySlot.$ === 1 ? 10 : mySlot.$ === 2 ? 20 : mySlot.$ === 3 ? 30 : -1;
    });

    expect(
      tgpu.resolve([
        myFn,
        myFn.with(mySlot, 1).$name('oneFn'),
        myFn.with(mySlot, 2).$name('twoFn'),
        myFn.with(mySlot, 3).$name('threeFn'),
      ]),
    ).toMatchInlineSnapshot(`
      "fn myFn() -> u32 {
        return -1u;
      }

      fn oneFn() -> u32 {
        return 10u;
      }

      fn twoFn() -> u32 {
        return 20u;
      }

      fn threeFn() -> u32 {
        return 30u;
      }"
    `);
  });

  it('should not include unused dependencies', ({ root }) => {
    const mySlot = tgpu.slot<boolean>();
    const myUniform = root.createUniform(d.u32);
    const myReadonly = root.createReadonly(d.u32);

    const myFn = tgpu.fn(
      [],
      d.u32,
    )(() => {
      return mySlot.$ ? myUniform.$ : myReadonly.$;
    });

    expect(tgpu.resolve([myFn.with(mySlot, true).$name('trueFn')])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> myUniform: u32;

      fn trueFn() -> u32 {
        return myUniform;
      }"
    `);

    expect(tgpu.resolve([myFn.with(mySlot, false).$name('falseFn')])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read> myReadonly: u32;

      fn falseFn() -> u32 {
        return myReadonly;
      }"
    `);
  });

  it('should handle undefined', ({ root }) => {
    const counter = root.createMutable(d.u32);

    const myFunction = tgpu.fn([])(() => {
      false ? counter.$++ : undefined;
    });
    expect(tgpu.resolve([myFunction])).toMatchInlineSnapshot(`
      "fn myFunction() {

      }"
    `);
  });

  it('should generate select() when branches are scalars', () => {
    function foo() {
      'use gpu';
      const cond = false;
      return cond ? 1 : 0;
    }

    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
      "fn foo() -> i32 {
        const cond = false;
        return select(0i, 1i, cond);
      }"
    `);
  });

  it('should generate select() when branches are vector constructors', () => {
    function foo() {
      'use gpu';
      const count = 10;
      const anchor = count > 0 ? d.vec2f(1, 2) : d.vec2f();
      return anchor;
    }

    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
      "fn foo() -> vec2f {
        const count = 10;
        let anchor = select(vec2f(), vec2f(1, 2), (count > 0i));
        return anchor;
      }"
    `);
  });

  it('should generate select() when branches contain side-effect free array indexing', () => {
    function foo() {
      'use gpu';
      const array = [0];
      const cond = false;
      return cond ? d.vec2f(array[0]!) : d.vec2f();
    }

    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
      "fn foo() -> vec2f {
        let array_1 = array<i32, 1>(0);
        const cond = false;
        return select(vec2f(), vec2f(f32(array_1[0i])), cond);
      }"
    `);
  });

  it('should throw when test is not comptime known', () => {
    const myFn = tgpu.fn(
      [d.u32],
      d.u32,
    )((n) => {
      return n > 0 ? n : -n;
    });

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: Ternary operator '(n > 0) ? n : (-n)' is invalid. For more complex branching, please use 'std.select' or if/else statements.]
    `);
  });
});
