import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import tgpu, { d } from '../../src/index.js';

describe('runtime ternary operator', () => {
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

  it('should handle ternary with comparison and unary negation in branches', () => {
    const myFn = tgpu.fn(
      [d.u32],
      d.u32,
    )((n) => {
      return n > 0 ? n : -n;
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn(n: u32) -> u32 {
        return select(-(n), n, (n > 0u));
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
