import { parse } from '@typegpu/wgsl-parser';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { IOLayout, UnwrapIO } from '../src/core/function/fnTypes';
import * as d from '../src/data';
import tgpu, { wgsl, type TgpuFnShell, type TgpuFn } from '../src/experimental';
import { parseWGSL } from './utils/parseWGSL';

describe('wgsl.fn', () => {
  it('should inject function declaration of called function', () => {
    const emptyFn = wgsl.fn`() {
      // do nothing
    }`.$name('empty');

    const actual = parseWGSL(wgsl`
      fn main() {
        ${emptyFn}();
      }
    `);

    const expected = parse(`
      fn empty() {}

      fn main() {
        empty();
      }
    `);

    expect(actual).toEqual(expected);
  });

  it('should inject function declaration only once', () => {
    const emptyFn = wgsl.fn`() {
      // do nothing
    }`.$name('empty');

    const actual = parseWGSL(wgsl`
      fn main() {
        ${emptyFn}();
        ${emptyFn}();
      }
    `);

    const expected = parse(`
      fn empty() {}

      fn main() {
        empty();
        empty();
      }
    `);

    expect(actual).toEqual(expected);
  });

  it('should inject function declaration only once (calls are nested)', () => {
    const emptyFn = wgsl.fn`() {
      // do nothing
    }`.$name('empty');

    const nestedAFn = wgsl.fn`() {
      ${emptyFn}();
    }`.$name('nested_a');

    const nestedBFn = wgsl.fn`() {
      ${emptyFn}();
    }`.$name('nested_b');

    const actual = parseWGSL(wgsl`
      fn main() {
        ${nestedAFn}();
        ${nestedBFn}();
      }
    `);

    const expected = parse(`
      fn empty() {}
      
      fn nested_a() {
        empty();
      }
      
      fn nested_b() {
        empty();
      }

      fn main() {
        nested_a();
        nested_b();
      }
    `);

    expect(actual).toEqual(expected);
  });
});

describe('tgpu.fn', () => {
  it('creates typed shell from parameters', () => {
    const proc = tgpu.fn([]);
    const one = tgpu.fn([d.f32]);
    const two = tgpu.fn([d.f32, d.u32]);

    expectTypeOf(proc).toEqualTypeOf<TgpuFnShell<[], undefined>>();
    expectTypeOf<ReturnType<typeof proc.implement>>().toEqualTypeOf<
      TgpuFn<[], undefined>
    >();

    expectTypeOf(one).toEqualTypeOf<TgpuFnShell<[d.F32], undefined>>();
    expectTypeOf<ReturnType<typeof one.implement>>().toEqualTypeOf<
      TgpuFn<[d.F32], undefined>
    >();

    expectTypeOf(two).toEqualTypeOf<TgpuFnShell<[d.F32, d.U32], undefined>>();
    expectTypeOf<ReturnType<typeof two.implement>>().toEqualTypeOf<
      TgpuFn<[d.F32, d.U32], undefined>
    >();
  });

  it('creates typed shell from parameters and return type', () => {
    const proc = tgpu.fn([], d.bool);
    const one = tgpu.fn([d.f32], d.bool);
    const two = tgpu.fn([d.f32, d.u32], d.bool);

    expectTypeOf(proc).toEqualTypeOf<TgpuFnShell<[], d.Bool>>();
    expectTypeOf<ReturnType<typeof proc.implement>>().toEqualTypeOf<
      TgpuFn<[], d.Bool>
    >();

    expectTypeOf(one).toEqualTypeOf<TgpuFnShell<[d.F32], d.Bool>>();
    expectTypeOf<ReturnType<typeof one.implement>>().toEqualTypeOf<
      TgpuFn<[d.F32], d.Bool>
    >();

    expectTypeOf(two).toEqualTypeOf<TgpuFnShell<[d.F32, d.U32], d.Bool>>();
    expectTypeOf<ReturnType<typeof two.implement>>().toEqualTypeOf<
      TgpuFn<[d.F32, d.U32], d.Bool>
    >();
  });
});

describe('UnwrapIO', () => {
  it('unwraps f32', () => {
    const layout = d.f32 satisfies IOLayout;

    expectTypeOf(layout).toEqualTypeOf<d.F32>();
    expectTypeOf<UnwrapIO<typeof layout>>().toEqualTypeOf<number>();
  });

  it('unwraps TgpuStruct', () => {
    const layout = d.struct({ a: d.f32, b: d.u32 }) satisfies IOLayout;

    expectTypeOf(layout).toEqualTypeOf<d.TgpuStruct<{ a: d.F32; b: d.U32 }>>();
    expectTypeOf<UnwrapIO<typeof layout>>().toEqualTypeOf<{
      a: number;
      b: number;
    }>();
  });

  it('unwraps TgpuArray', () => {
    const layout = d.arrayOf(d.f32, 32) satisfies IOLayout;

    expectTypeOf(layout).toEqualTypeOf<d.TgpuArray<d.F32>>();
    expectTypeOf<UnwrapIO<typeof layout>>().toEqualTypeOf<number[]>();
  });

  it('unwraps a tuple of numeric primitives', () => {
    const layout = [d.f32, d.u32] as const satisfies IOLayout;

    expectTypeOf(layout).toEqualTypeOf<[d.F32, d.U32]>();
    expectTypeOf<UnwrapIO<typeof layout>>().toEqualTypeOf<[number, number]>();
  });

  it('unwraps a record of numeric primitives', () => {
    const layout = { a: d.f32, b: d.location(2, d.u32) } satisfies IOLayout;

    expectTypeOf(layout).toEqualTypeOf<{
      a: d.F32;
      b: d.Decorated<d.U32, [d.Location<2>]>;
    }>();
    expectTypeOf<UnwrapIO<typeof layout>>().toEqualTypeOf<{
      a: number;
      b: number;
    }>();
  });

  it('unwraps a record of arrays of numeric primitives', () => {
    const layout = {
      a: [d.f32, d.f32] as const,
      b: [d.u32, d.u32] as const,
    } satisfies IOLayout;

    expectTypeOf(layout).toEqualTypeOf<{
      a: [d.F32, d.F32];
      b: [d.U32, d.U32];
    }>();
    expectTypeOf<UnwrapIO<typeof layout>>().toEqualTypeOf<{
      a: [number, number];
      b: [number, number];
    }>();
  });
});
