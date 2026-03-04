import { describe, expect, expectTypeOf, it } from 'vitest';
import { d, tgpu } from '../src/index.js';

describe('d.align', () => {
  it('adds @align attribute for custom aligned struct members', () => {
    const s1 = d.struct({
      a: d.u32,
      b: d.align(16, d.u32),
      c: d.u32,
    });

    expect(tgpu.resolve([s1])).toContain('@align(16) b: u32,');
  });

  it('changes alignment of a struct containing aligned member', () => {
    expect(
      d.alignmentOf(
        d.struct({
          a: d.u32,
          b: d.u32,
          c: d.u32,
        }),
      ),
    ).toBe(4);

    expect(
      d.alignmentOf(
        d.struct({
          a: d.u32,
          b: d.align(16, d.u32),
          c: d.u32,
        }),
      ),
    ).toBe(16);
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
    ).toBe(12);

    expect(
      d.sizeOf(
        d.struct({
          a: d.u32,
          b: d.align(16, d.u32),
          c: d.u32,
        }),
      ),
    ).toBe(32);

    expect(
      d.sizeOf(
        d.struct({
          a: d.u32,
          b: d.align(16, d.u32),
          c: d.align(16, d.u32),
        }),
      ),
    ).toBe(48);

    // nested
    const FooStruct = d.struct({
      a: d.u32,
      b: d.struct({
        c: d.f32,
        d: d.align(16, d.f32),
      }),
    });
    expect(d.sizeOf(FooStruct)).toBe(48);

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
    ).toBe(64);
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

    expectTypeOf(alignedArray).toEqualTypeOf<d.Decorated<d.WgslArray<d.Vec3f>, [d.Align<16>]>>();
    expect(d.isLooseData(alignedArray)).toBe(false);

    expectTypeOf(alignedDisarray).toEqualTypeOf<
      d.LooseDecorated<d.Disarray<d.Vec3f>, [d.Align<16>]>
    >();
    expect(d.isLooseData(alignedDisarray)).toBe(true);
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
