import { parse } from 'tgpu-wgsl-parser';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { IOLayout, InferIO } from '../src/core/function/fnTypes';
import { type TgpuFn, type TgpuFnShell, fn } from '../src/core/function/tgpuFn';
import * as d from '../src/data';
import { parseResolved } from './utils/parseResolved';

describe('tgpu.fn', () => {
  it('should inject function declaration of called function', () => {
    const emptyFn = fn([])
      .does(`() {
        // do nothing
      }`)
      .$name('empty');

    const actual = parseResolved({ emptyFn });

    const expected = parse('fn empty() {}');

    expect(actual).toEqual(expected);
  });

  it('should inject function declaration only once', () => {
    const emptyFn = fn([])
      .does(`() {
        // do nothing
      }`)
      .$name('empty');

    const actual = parseResolved({
      main: fn([])
        .does(`
          () {
            emptyFn();
            emptyFn();
          }`)
        .$uses({ emptyFn })
        .$name('main'),
    });

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
    const emptyFn = fn([])
      .does(`() {
        // do nothing
      }`)
      .$name('empty');

    const nestedAFn = fn([])
      .does(`() {
        emptyFn();
      }`)
      .$uses({ emptyFn })
      .$name('nested_a');

    const nestedBFn = fn([])
      .does(`() {
        emptyFn();
      }`)
      .$uses({ emptyFn })
      .$name('nested_b');

    const actual = parseResolved({
      main: fn([])
        .does(`() {
          nestedAFn();
          nestedBFn();
        }`)
        .$uses({ nestedAFn, nestedBFn })
        .$name('main'),
    });

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

  it('creates typed shell from parameters', () => {
    const proc = fn([]);
    const one = fn([d.f32]);
    const two = fn([d.f32, d.u32]);

    expectTypeOf(proc).toEqualTypeOf<TgpuFnShell<[], undefined>>();
    expectTypeOf<ReturnType<typeof proc.does>>().toEqualTypeOf<
      TgpuFn<[], undefined>
    >();

    expectTypeOf(one).toEqualTypeOf<TgpuFnShell<[d.F32], undefined>>();
    expectTypeOf<ReturnType<typeof one.does>>().toEqualTypeOf<
      TgpuFn<[d.F32], undefined>
    >();

    expectTypeOf(two).toEqualTypeOf<TgpuFnShell<[d.F32, d.U32], undefined>>();
    expectTypeOf<ReturnType<typeof two.does>>().toEqualTypeOf<
      TgpuFn<[d.F32, d.U32], undefined>
    >();
  });

  it('creates typed shell from parameters and return type', () => {
    const proc = fn([], d.bool);
    const one = fn([d.f32], d.bool);
    const two = fn([d.f32, d.u32], d.bool);

    expectTypeOf(proc).toEqualTypeOf<TgpuFnShell<[], d.Bool>>();
    expectTypeOf<ReturnType<typeof proc.does>>().toEqualTypeOf<
      TgpuFn<[], d.Bool>
    >();

    expectTypeOf(one).toEqualTypeOf<TgpuFnShell<[d.F32], d.Bool>>();
    expectTypeOf<ReturnType<typeof one.does>>().toEqualTypeOf<
      TgpuFn<[d.F32], d.Bool>
    >();

    expectTypeOf(two).toEqualTypeOf<TgpuFnShell<[d.F32, d.U32], d.Bool>>();
    expectTypeOf<ReturnType<typeof two.does>>().toEqualTypeOf<
      TgpuFn<[d.F32, d.U32], d.Bool>
    >();
  });
});

describe('InferIO', () => {
  it('unwraps f32', () => {
    const layout = d.f32 satisfies IOLayout;

    expectTypeOf<InferIO<typeof layout>>().toEqualTypeOf<number>();
  });

  it('unwraps a record of numeric primitives', () => {
    const layout = { a: d.f32, b: d.location(2, d.u32) } satisfies IOLayout;

    expectTypeOf<InferIO<typeof layout>>().toEqualTypeOf<{
      a: number;
      b: number;
    }>();
  });
});
