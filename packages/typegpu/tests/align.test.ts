import { describe, expect, expectTypeOf, it } from 'vitest';
import tgpu from '../src';
import * as d from '../src/data';
import { alignmentOf } from '../src/data/alignmentOf';

describe('d.align', () => {
  it('adds @align attribute for custom aligned struct members', () => {
    const s1 = d
      .struct({
        a: d.u32,
        b: d.align(16, d.u32),
        c: d.u32,
      })
      .$name('s1');

    expect(tgpu.resolve({ externals: { s1 }, names: 'strict' })).toContain(
      '@align(16) b: u32,',
    );
  });

  it('changes alignment of a struct containing aligned member', () => {
    expect(
      alignmentOf(
        d.struct({
          a: d.u32,
          b: d.u32,
          c: d.u32,
        }),
      ),
    ).toEqual(4);

    expect(
      alignmentOf(
        d.struct({
          a: d.u32,
          b: d.align(16, d.u32),
          c: d.u32,
        }),
      ),
    ).toEqual(16);
  });

  it('changes size of a struct containing aligned member', () => {
    expect(
      d.sizeOf(
        d.struct({
          a: d.u32,
          b: d.u32,
          c: d.u32,
        }),
      ),
    ).toEqual(12);

    expect(
      d.sizeOf(
        d.struct({
          a: d.u32,
          b: d.align(16, d.u32),
          c: d.u32,
        }),
      ),
    ).toEqual(32);

    expect(
      d.sizeOf(
        d.struct({
          a: d.u32,
          b: d.align(16, d.u32),
          c: d.align(16, d.u32),
        }),
      ),
    ).toEqual(48);

    // nested
    const FooStruct = d.struct({
      a: d.u32,
      b: d.struct({
        c: d.f32,
        d: d.align(16, d.f32),
      }),
    });
    expect(d.sizeOf(FooStruct)).toEqual(48);

    expect(
      d.sizeOf(
        d.struct({
          a: d.u32,
          b: d.align(
            32,
            d.struct({
              c: d.f32,
              d: d.align(16, d.f32),
            }),
          ),
        }),
      ),
    ).toEqual(64);
  });

  it('throws for invalid align values', () => {
    expect(() => d.align(11, d.u32)).toThrow();
    expect(() => d.align(8, d.vec3f)).toThrow();
    expect(() => d.align(-2, d.u32)).toThrow();
  });

  it('allows aligning loose data without losing the looseness information', () => {
    const array = d.arrayOf(d.vec3f, 2);
    const alignedArray = d.align(16, array);

    const disarray = d.disarrayOf(d.vec3f, 2);
    const alignedDisarray = d.align(16, disarray);

    expectTypeOf(alignedArray).toEqualTypeOf<
      d.Decorated<d.WgslArray<d.Vec3f>, [d.Align<16>]>
    >();
    expect(d.isLooseData(alignedArray)).toEqual(false);

    expectTypeOf(alignedDisarray).toEqualTypeOf<
      d.LooseDecorated<d.Disarray<d.Vec3f>, [d.Align<16>]>
    >();
    expect(d.isLooseData(alignedDisarray)).toEqual(true);
  });

  it('does not allow aligned loose data as non-loose struct members', () => {
    const array = d.arrayOf(d.u32, 2);
    const alignedArray = d.align(16, array);

    const disarray = d.disarrayOf(d.u32, 2);
    const alignedDisarray = d.align(16, disarray);

    d.struct({
      // @ts-expect-error
      a: alignedDisarray,
    });

    d.struct({
      a: alignedArray,
    });
  });
});
