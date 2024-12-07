import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type Align,
  type Decorated,
  type LooseArray,
  type LooseDecorated,
  type Vec3f,
  type WgslArray,
  align,
  arrayOf,
  f32,
  isLooseData,
  looseArrayOf,
  sizeOf,
  struct,
  u32,
  vec3f,
} from '../src/data';
import { alignmentOf } from '../src/data/alignmentOf';
import tgpu from '../src/experimental';

describe('d.align', () => {
  it('adds @align attribute for custom aligned struct members', () => {
    const s1 = struct({
      a: u32,
      b: align(16, u32),
      c: u32,
    }).$name('s1');

    expect(tgpu.resolve({ input: s1, names: 'strict' })).toContain(
      '@align(16) b: u32,',
    );
  });

  it('changes alignment of a struct containing aligned member', () => {
    expect(
      alignmentOf(
        struct({
          a: u32,
          b: u32,
          c: u32,
        }),
      ),
    ).toEqual(4);

    expect(
      alignmentOf(
        struct({
          a: u32,
          b: align(16, u32),
          c: u32,
        }),
      ),
    ).toEqual(16);
  });

  it('changes size of a struct containing aligned member', () => {
    expect(
      sizeOf(
        struct({
          a: u32,
          b: u32,
          c: u32,
        }),
      ),
    ).toEqual(12);

    expect(
      sizeOf(
        struct({
          a: u32,
          b: align(16, u32),
          c: u32,
        }),
      ),
    ).toEqual(32);

    expect(
      sizeOf(
        struct({
          a: u32,
          b: align(16, u32),
          c: align(16, u32),
        }),
      ),
    ).toEqual(48);

    // nested
    expect(
      sizeOf(
        struct({
          a: u32,
          b: struct({
            c: f32,
            d: align(16, f32),
          }),
        }),
      ),
    ).toEqual(48);

    expect(
      sizeOf(
        struct({
          a: u32,
          b: align(
            32,
            struct({
              c: f32,
              d: align(16, f32),
            }),
          ),
        }),
      ),
    ).toEqual(64);
  });

  it('throws for invalid align values', () => {
    expect(() => align(11, u32)).toThrow();
    expect(() => align(8, vec3f)).toThrow();
    expect(() => align(-2, u32)).toThrow();
  });

  it('allows aligning loose data without losing the looseness information', () => {
    const array = arrayOf(vec3f, 2);
    const alignedArray = align(16, array);

    const looseArray = looseArrayOf(vec3f, 2);
    const alignedLooseArray = align(16, looseArray);

    expectTypeOf(alignedArray).toEqualTypeOf<
      Decorated<WgslArray<Vec3f>, [Align<16>]>
    >();
    expect(isLooseData(alignedArray)).toEqual(false);

    expectTypeOf(alignedLooseArray).toEqualTypeOf<
      LooseDecorated<LooseArray<Vec3f>, [Align<16>]>
    >();
    expect(isLooseData(alignedLooseArray)).toEqual(true);
  });

  it('does not allow aligned loose data as non-loose struct members', () => {
    const array = arrayOf(u32, 2);
    const alignedArray = align(16, array);

    const looseArray = looseArrayOf(u32, 2);
    const alignedLooseArray = align(16, looseArray);

    struct({
      // @ts-expect-error
      a: alignedLooseArray,
    });

    struct({
      a: alignedArray,
    });
  });
});
