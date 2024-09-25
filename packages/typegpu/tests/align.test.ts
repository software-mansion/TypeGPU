import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type TgpuAligned,
  type TgpuArray,
  type TgpuLooseAligned,
  type TgpuLooseArray,
  type Vec3f,
  align,
  arrayOf,
  f32,
  looseArrayOf,
  struct,
  u32,
  vec3f,
} from '../src/data';
import { StrictNameRegistry } from '../src/experimental';
import { ResolutionCtxImpl } from '../src/resolutionCtx';

describe('align', () => {
  it('adds @align attribute for custom aligned struct members', () => {
    const s1 = struct({
      a: u32,
      b: align(16, u32),
      c: u32,
    }).$name('s1');

    const resolutionCtx = new ResolutionCtxImpl({
      names: new StrictNameRegistry(),
    });

    expect(resolutionCtx.resolve(s1)).toContain('@align(16) b: u32,');
  });

  it('changes alignment of a struct containing aligned member', () => {
    expect(
      struct({
        a: u32,
        b: u32,
        c: u32,
      }).byteAlignment,
    ).toEqual(4);

    expect(
      struct({
        a: u32,
        b: align(16, u32),
        c: u32,
      }).byteAlignment,
    ).toEqual(16);
  });

  it('changes size of a struct containing aligned member', () => {
    expect(
      struct({
        a: u32,
        b: u32,
        c: u32,
      }).size,
    ).toEqual(12);

    expect(
      struct({
        a: u32,
        b: align(16, u32),
        c: u32,
      }).size,
    ).toEqual(32);

    expect(
      struct({
        a: u32,
        b: align(16, u32),
        c: align(16, u32),
      }).size,
    ).toEqual(48);

    // nested
    expect(
      struct({
        a: u32,
        b: struct({
          c: f32,
          d: align(16, f32),
        }),
      }).size,
    ).toEqual(48);

    expect(
      struct({
        a: u32,
        b: align(
          32,
          struct({
            c: f32,
            d: align(16, f32),
          }),
        ),
      }).size,
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
      TgpuAligned<16, TgpuArray<Vec3f>>
    >();
    expect(alignedArray.isLoose).toEqual(false);

    expectTypeOf(alignedLooseArray).toEqualTypeOf<
      TgpuLooseAligned<16, TgpuLooseArray<Vec3f>>
    >();
    expect(alignedLooseArray.isLoose).toEqual(true);
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
