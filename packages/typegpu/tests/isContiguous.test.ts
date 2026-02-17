import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';

describe('d.isContiguous', () => {
  it('primitives', () => {
    expect(d.isContiguous(d.bool)).toBe(true);
    expect(d.isContiguous(d.f32)).toBe(true);
    expect(d.isContiguous(d.f16)).toBe(true);
    expect(d.isContiguous(d.i32)).toBe(true);
    expect(d.isContiguous(d.u32)).toBe(true);
    expect(d.isContiguous(d.u16)).toBe(true);
  });

  it('vectors', () => {
    expect(d.isContiguous(d.vec2f)).toBe(true);
    expect(d.isContiguous(d.vec2h)).toBe(true);
    expect(d.isContiguous(d.vec2i)).toBe(true);
    expect(d.isContiguous(d.vec2u)).toBe(true);
    expect(d.isContiguous(d.vec2b)).toBe(true);

    expect(d.isContiguous(d.vec3f)).toBe(true);
    expect(d.isContiguous(d.vec3h)).toBe(true);
    expect(d.isContiguous(d.vec3i)).toBe(true);
    expect(d.isContiguous(d.vec3u)).toBe(true);
    expect(d.isContiguous(d.vec3b)).toBe(true);

    expect(d.isContiguous(d.vec4f)).toBe(true);
    expect(d.isContiguous(d.vec4h)).toBe(true);
    expect(d.isContiguous(d.vec4i)).toBe(true);
    expect(d.isContiguous(d.vec4u)).toBe(true);
    expect(d.isContiguous(d.vec4b)).toBe(true);
  });

  it('matrices', () => {
    expect(d.isContiguous(d.mat2x2f)).toBe(true);
    expect(d.isContiguous(d.mat3x3f)).toBe(false);
    expect(d.isContiguous(d.mat4x4f)).toBe(true);
  });

  it('atomics', () => {
    expect(d.isContiguous(d.atomic(d.u32))).toBe(true);
    expect(d.isContiguous(d.atomic(d.i32))).toBe(true);
  });

  it('decorated', () => {
    expect(d.isContiguous(d.size(4, d.u32))).toBe(true);
    expect(d.isContiguous(d.size(16, d.u32))).toBe(false);
    expect(d.isContiguous(d.size(64, d.mat3x3f))).toBe(false);
    expect(d.isContiguous(d.align(16, d.vec3f))).toBe(true);
    expect(d.isContiguous(d.location(1, d.u32))).toBe(true);
  });

  it('arrays', () => {
    expect(d.isContiguous(d.arrayOf(d.u32, 7))).toBe(true);
    expect(d.isContiguous(d.arrayOf(d.vec3f, 7))).toBe(false);

    // C - contiguous, S - struct
    const CS = d.struct({
      x: d.u32,
      y: d.u32,
      z: d.vec2u,
    });
    expect(d.isContiguous(d.arrayOf(CS, 7))).toBe(true);

    // N - Not, C - contiguous, S - struct
    const NCS = d.struct({
      x: d.atomic(d.i32),
      vec: d.vec4b,
    });
    expect(d.isContiguous(d.arrayOf(NCS, 7))).toBe(false);

    // nested arrays are contiguous iff.
    // base elements are contiguous and their `sizeOf` === `alignOf` (no padding at the end)
    expect(d.isContiguous(d.arrayOf(d.arrayOf(d.u32, 7), 7))).toBe(true);
    expect(d.isContiguous(d.arrayOf(d.arrayOf(CS, 7), 7))).toBe(true);
    expect(d.isContiguous(d.arrayOf(d.arrayOf(d.vec3f, 7), 7))).toBe(false);
    expect(d.isContiguous(d.arrayOf(d.arrayOf(NCS, 7), 7))).toBe(false);
  });

  it('structs', () => {
    const CS1 = d.struct({
      vec: d.vec4u,
    });
    expect(d.isContiguous(CS1)).toBe(true);

    const CS2 = d.struct({
      x: d.u32,
      y: d.u32,
      z: d.vec2u,
    });
    expect(d.isContiguous(CS2)).toBe(true);

    const CS3 = d.struct({
      vec: d.vec3f,
      a: d.u16,
      b: d.u16,
    });
    expect(d.isContiguous(CS3)).toBe(true);

    // padding at the end
    const NCS1 = d.struct({
      vec: d.vec4f,
      x: d.u32,
    });
    expect(d.isContiguous(NCS1)).toBe(false);

    // padding in the middle
    const NCS2 = d.struct({
      x: d.atomic(d.i32),
      vec: d.vec4b,
    });
    expect(d.isContiguous(NCS2)).toBe(false);

    // padding within field
    const NCS3 = d.struct({
      m: d.mat3x3f,
    });
    expect(d.isContiguous(NCS3)).toBe(false);
  });

  it('complex - structs and arrays as fields', () => {
    const CNestedStruct = d.struct({
      inner: d.struct({
        a: d.u32,
        b: d.f32,
      }),
    });
    expect(d.isContiguous(CNestedStruct)).toBe(true);

    const CNestedArray = d.struct({
      data: d.arrayOf(d.vec4f, 7),
    });
    expect(d.isContiguous(CNestedArray)).toBe(true);

    const NCNestedStruct = d.struct({
      inner: d.struct({
        v: d.vec3f,
      }),
    });
    expect(d.isContiguous(NCNestedStruct)).toBe(false);

    const NCNestedArray = d.struct({
      arr: d.arrayOf(d.mat3x3f, 7),
    });
    expect(d.isContiguous(NCNestedArray)).toBe(false);
  });

  it('complex - structs with decorated fields', () => {
    // size breaks the contiguousness
    const S1 = d.struct({
      v: d.size(32, d.vec4u),
    });
    expect(d.isContiguous(S1)).toBe(false);

    // align breaks the contiguousness
    const S2 = d.struct({
      v: d.align(32, d.vec4u),
    });
    expect(d.isContiguous(S2)).toBe(false);

    const S3 = d.struct({
      arr: d.size(72, d.arrayOf(d.vec3f, 4)),
    });
    expect(d.isContiguous(S3)).toBe(false);

    const Aligne16dF32 = d.align(16, d.f32);
    expect(d.isContiguous(Aligne16dF32)).toBe(true);
    const S4 = d.struct({
      arr: d.arrayOf(d.f32, 16),
      frac: Aligne16dF32,
    });
    expect(d.isContiguous(S4)).toBe(false);
  });

  it('complex - deep struct (positive)', () => {
    // layout for this struct: https://shorturl.at/TcoqP
    const DeepStruct = d.struct({
      someData: d.arrayOf(d.f32, 16),
      nested: d.struct({
        randomData: d.f32,
        x: d.atomic(d.u32),
        y: d.u32,
        l: d.f16,
        r: d.f16,
        innerNested: d.arrayOf(
          d.struct({
            xx: d.atomic(d.u32),
            yy: d.u32,
            zz: d.u32,
            ww: d.u32,
            myVec: d.vec4u,
          }),
          3,
        ),
        z: d.u32,
        additionalData: d.arrayOf(d.u32, 35),
      }),
    });
    expect(d.isContiguous(DeepStruct)).toBe(true);
  });

  it('complex - deep struct (negative)', () => {
    // layout for this struct: https://shorturl.at/NQggS
    const DeepStruct = d.struct({
      someData: d.arrayOf(d.f32, 13),
      nested: d.struct({
        randomData: d.f32,
        x: d.atomic(d.u32),
        y: d.u32,
        innerNested: d.arrayOf(
          d.struct({
            xx: d.atomic(d.u32),
            yy: d.u32,
            zz: d.u32,
            myVec: d.vec4u,
          }),
          3,
        ),
        z: d.u32,
        additionalData: d.arrayOf(d.u32, 32),
      }),
    });
    expect(d.isContiguous(DeepStruct)).toBe(false);
  });
});

it('disarrays and unstructs - simple', () => {
  expect(d.isContiguous(d.disarrayOf(d.u32, 7))).toBe(true);
  expect(d.isContiguous(d.disarrayOf(d.vec3f, 7))).toBe(true);
  expect(d.isContiguous(d.disarrayOf(d.vec4f, 3))).toBe(true);
  expect(d.isContiguous(d.disarrayOf(d.mat3x3f, 7))).toBe(false);

  expect(d.isContiguous(
    d.unstruct({
      x: d.u32,
      y: d.u32,
    }),
  )).toBe(true);
  expect(d.isContiguous(
    d.unstruct({
      v: d.vec3f,
      x: d.u32,
    }),
  )).toBe(true);
  expect(d.isContiguous(
    d.unstruct({
      m: d.mat3x3f,
    }),
  )).toBe(false);
});

it('disarrays and unstructs - decorated elements and fields', () => {
  expect(d.isContiguous(d.disarrayOf(d.size(4, d.u32), 7))).toBe(true);
  expect(d.isContiguous(d.disarrayOf(d.align(4, d.u32), 7))).toBe(true);
  expect(d.isContiguous(d.disarrayOf(d.size(8, d.u32), 7))).toBe(false);
  expect(d.isContiguous(d.disarrayOf(d.align(8, d.u32), 7))).toBe(false);

  expect(d.isContiguous(
    d.unstruct({
      x: d.size(16, d.u32),
      y: d.u32,
    }),
  )).toBe(false);

  expect(d.isContiguous(
    d.unstruct({
      x: d.align(8, d.u32),
      y: d.u32,
    }),
  )).toBe(true);

  expect(d.isContiguous(
    d.unstruct({
      x: d.u32,
      y: d.align(8, d.u32),
    }),
  )).toBe(false);

  expect(d.isContiguous(
    d.unstruct({
      arr: d.disarrayOf(d.vec3f, 7),
    }),
  )).toBe(true);

  expect(d.isContiguous(
    d.disarrayOf(
      d.unstruct({
        x: d.vec3f,
      }),
      7,
    ),
  )).toBe(true);
});
