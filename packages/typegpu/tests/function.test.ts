import { parse } from '@typegpu/wgsl-parser';
import { describe, expect, expectTypeOf, it } from 'vitest';
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
