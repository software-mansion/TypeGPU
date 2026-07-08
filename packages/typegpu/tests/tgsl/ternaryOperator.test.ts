import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu, d, std } from 'typegpu';

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

  it('should throw when test cannot be converted to bool', () => {
    const myFn = tgpu.fn(
      [d.vec3f, d.u32],
      d.u32,
    )((v, n) => {
      return v ? n : n + 1;
    });

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: Cannot convert value of type 'vec3f' to any of the target types: [bool]]
    `);
  });

  it('should generate select() for runtime condition with function params', () => {
    const myFn = tgpu.fn(
      [d.i32],
      d.i32,
    )((n) => {
      return n > 0 ? n : -n;
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn(n: i32) -> i32 {
        return select(-(n), n, (n > 0i));
      }"
    `);
  });

  it('should handle subtraction in branches with function params', () => {
    const myFn = tgpu.fn(
      [d.u32, d.u32],
      d.u32,
    )((b, w) => {
      return b > w ? b - w : w - b;
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn(b: u32, w: u32) -> u32 {
        return select((w - b), (b - w), (b > w));
      }"
    `);
  });

  it('should handle const array indexing in branches', () => {
    const RotLut2Gpu = tgpu.const(d.arrayOf(d.u32, 2), [10, 20]);
    const RotLut3Gpu = tgpu.const(d.arrayOf(d.u32, 3), [30, 40, 50]);

    const myFn = tgpu.fn(
      [d.u32, d.u32],
      d.u32,
    )((r, bitU) => {
      return r === d.u32(2) ? (RotLut2Gpu.$[bitU] as number) : (RotLut3Gpu.$[bitU] as number);
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "const RotLut2Gpu: array<u32, 2> = array<u32, 2>(10u, 20u);

      const RotLut3Gpu: array<u32, 3> = array<u32, 3>(30u, 40u, 50u);

      fn myFn(r: u32, bitU: u32) -> u32 {
        return select(RotLut3Gpu[bitU], RotLut2Gpu[bitU], (r == 2u));
      }"
    `);
  });

  it('should handle nested runtime ternaries', () => {
    const myFn = tgpu.fn(
      [d.u32, d.u32, d.u32, d.u32],
      d.u32,
    )((r, v1, v2, v3) => {
      return r === d.u32(1) ? v1 : r === d.u32(2) ? v2 : v3;
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn(r: u32, v1: u32, v2: u32, v3: u32) -> u32 {
        return select(select(v3, v2, (r == 2u)), v1, (r == 1u));
      }"
    `);
  });

  it('should handle bit shift in branch with function param', () => {
    const myFn = tgpu.fn(
      [d.bool],
      d.u32,
    )((isCustom) => {
      return isCustom ? d.u32(1) << d.u32(20) : d.u32(0);
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn(isCustom: bool) -> u32 {
        return select(0u, (1u << 20u), isCustom);
      }"
    `);
  });

  it('should handle struct field access across ternaries', () => {
    const Cw = d.struct({
      low: d.u32,
      high: d.u32,
    });

    const myFn = tgpu.fn(
      [d.bool, Cw, Cw],
      d.u32,
    )((isCustom, customCw, stdCw) => {
      return isCustom ? customCw.low : stdCw.low;
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "struct Cw {
        low: u32,
        high: u32,
      }

      fn myFn(isCustom: bool, customCw: Cw, stdCw: Cw) -> u32 {
        return select(stdCw.low, customCw.low, isCustom);
      }"
    `);
  });

  it('should handle buffer layout access in ternary branches', ({ root }) => {
    const Cw = d.struct({
      low: d.u32,
      high: d.u32,
    });

    const Layout = d.struct({
      codewords: d.arrayOf(Cw, 64),
    });

    const layout = root.createUniform(Layout, d.ref);

    const myFn = tgpu.fn(
      [d.bool, d.u32],
      d.u32,
    )((isCustom, cwIdx) => {
      return isCustom ? layout.$.codewords[cwIdx]!.low : layout.$.codewords[cwIdx + d.u32(1)]!.low;
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "struct Cw {
        low: u32,
        high: u32,
      }

      struct Layout {
        codewords: array<Cw, 64>,
      }

      @group(0) @binding(0) var<uniform> layout_1: Layout;

      fn myFn(isCustom: bool, cwIdx: u32) -> u32 {
        return select(layout_1.codewords[(cwIdx + 1u)].low, layout_1.codewords[cwIdx].low, isCustom);
      }"
    `);
  });

  it('should throw when a ternary branch contains an assignment', () => {
    const myFn = tgpu.fn(
      [d.i32],
      d.i32,
    )((a) => {
      let b = 0;
      return a > 0 ? (b = a) : 0;
    });

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: Ternary operator '(a > 0) ? (b = a) : 0' is invalid. For more complex branching, please use 'std.select' or if/else statements.]
    `);
  });
});
