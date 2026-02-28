import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';

describe('d.getLongestContiguousPrefix', () => {
  it('primitives', () => {
    expect(d.getLongestContiguousPrefix(d.bool)).toBe(4);
    expect(d.getLongestContiguousPrefix(d.f32)).toBe(4);
    expect(d.getLongestContiguousPrefix(d.f16)).toBe(2);
    expect(d.getLongestContiguousPrefix(d.i32)).toBe(4);
    expect(d.getLongestContiguousPrefix(d.u32)).toBe(4);
    expect(d.getLongestContiguousPrefix(d.u16)).toBe(2);
  });

  it('vectors', () => {
    expect(d.getLongestContiguousPrefix(d.vec2f)).toBe(8);
    expect(d.getLongestContiguousPrefix(d.vec2h)).toBe(4);
    expect(d.getLongestContiguousPrefix(d.vec2i)).toBe(8);
    expect(d.getLongestContiguousPrefix(d.vec2u)).toBe(8);
    expect(d.getLongestContiguousPrefix(d.vec2b)).toBe(8);

    expect(d.getLongestContiguousPrefix(d.vec3f)).toBe(12);
    expect(d.getLongestContiguousPrefix(d.vec3h)).toBe(6);
    expect(d.getLongestContiguousPrefix(d.vec3i)).toBe(12);
    expect(d.getLongestContiguousPrefix(d.vec3u)).toBe(12);
    expect(d.getLongestContiguousPrefix(d.vec3b)).toBe(12);

    expect(d.getLongestContiguousPrefix(d.vec4f)).toBe(16);
    expect(d.getLongestContiguousPrefix(d.vec4h)).toBe(8);
    expect(d.getLongestContiguousPrefix(d.vec4i)).toBe(16);
    expect(d.getLongestContiguousPrefix(d.vec4u)).toBe(16);
    expect(d.getLongestContiguousPrefix(d.vec4b)).toBe(16);
  });

  it('matrices', () => {
    expect(d.getLongestContiguousPrefix(d.mat2x2f)).toBe(16);
    expect(d.getLongestContiguousPrefix(d.mat3x3f)).toBe(12);
    expect(d.getLongestContiguousPrefix(d.mat4x4f)).toBe(64);
  });

  it('atomics', () => {
    expect(d.getLongestContiguousPrefix(d.atomic(d.u32))).toBe(4);
    expect(d.getLongestContiguousPrefix(d.atomic(d.i32))).toBe(4);
  });

  it('decorated', () => {
    expect(d.getLongestContiguousPrefix(d.size(4, d.u32))).toBe(4);
    expect(d.getLongestContiguousPrefix(d.size(16, d.u32))).toBe(4);
    expect(d.getLongestContiguousPrefix(d.size(128, d.mat3x3f))).toBe(12);
    expect(d.getLongestContiguousPrefix(d.align(32, d.vec3f))).toBe(12);
    expect(d.getLongestContiguousPrefix(d.location(1, d.u32))).toBe(4);
  });

  it('arrays', () => {
    expect(d.getLongestContiguousPrefix(d.arrayOf(d.u32, 7))).toBe(28);
    expect(d.getLongestContiguousPrefix(d.arrayOf(d.vec3f, 7))).toBe(12);

    // C - contiguous, S - struct
    const CS = d.struct({
      x: d.u32,
      y: d.u32,
      z: d.vec2u,
    });
    expect(d.getLongestContiguousPrefix(d.arrayOf(CS, 2))).toBe(32);

    // N - Not, C - contiguous, S - struct
    const NCS = d.struct({
      x: d.atomic(d.i32),
      vec: d.vec4b,
    });
    expect(d.getLongestContiguousPrefix(d.arrayOf(NCS, 2))).toBe(4);

    expect(d.getLongestContiguousPrefix(d.arrayOf(d.arrayOf(d.u32, 2), 2))).toBe(16);
    expect(d.getLongestContiguousPrefix(d.arrayOf(d.arrayOf(CS, 2), 2))).toBe(64);
    expect(d.getLongestContiguousPrefix(d.arrayOf(d.arrayOf(d.vec3f, 2), 2))).toBe(12);
    expect(d.getLongestContiguousPrefix(d.arrayOf(d.arrayOf(NCS, 2), 2))).toBe(4);
  });

  it('structs', () => {
    const CS1 = d.struct({
      vec: d.vec4u,
    });
    expect(d.getLongestContiguousPrefix(CS1)).toBe(16);

    const CS2 = d.struct({
      x: d.u32,
      y: d.u32,
      z: d.vec2u,
    });
    expect(d.getLongestContiguousPrefix(CS2)).toBe(16);

    const CS3 = d.struct({
      vec: d.vec3f,
      a: d.u16,
      b: d.u16,
    });
    expect(d.getLongestContiguousPrefix(CS3)).toBe(16);

    const NCS1 = d.struct({
      vec: d.vec4f,
      x: d.u32,
    });
    expect(d.getLongestContiguousPrefix(NCS1)).toBe(20);

    const NCS2 = d.struct({
      x: d.atomic(d.i32),
      vec: d.vec4b,
    });
    expect(d.getLongestContiguousPrefix(NCS2)).toBe(4);

    const NCS3 = d.struct({
      m: d.mat3x3f,
    });
    expect(d.getLongestContiguousPrefix(NCS3)).toBe(12);
  });

  it('complex - structs and arrays as fields', () => {
    const CNestedStruct = d.struct({
      inner: d.struct({
        a: d.u32,
        b: d.f32,
      }),
    });
    expect(d.getLongestContiguousPrefix(CNestedStruct)).toBe(8);

    const CNestedArray = d.struct({
      data: d.arrayOf(d.vec4f, 2),
    });
    expect(d.getLongestContiguousPrefix(CNestedArray)).toBe(32);

    const NCNestedStruct = d.struct({
      inner: d.struct({
        v: d.vec3f,
      }),
    });
    expect(d.getLongestContiguousPrefix(NCNestedStruct)).toBe(12);

    const NCNestedArray = d.struct({
      arr: d.arrayOf(d.mat3x3f, 2),
    });
    expect(d.getLongestContiguousPrefix(NCNestedArray)).toBe(12);
  });

  it('complex - structs with decorated fields', () => {
    const S1 = d.struct({
      v: d.size(32, d.vec4u),
    });
    expect(d.getLongestContiguousPrefix(S1)).toBe(16);

    const S2 = d.struct({
      v: d.align(32, d.vec4u),
    });
    expect(d.getLongestContiguousPrefix(S2)).toBe(16);

    const S3 = d.struct({
      arr: d.size(72, d.arrayOf(d.vec3f, 4)),
    });
    expect(d.getLongestContiguousPrefix(S3)).toBe(12);

    const Aligne16dF32 = d.align(16, d.f32);
    expect(d.getLongestContiguousPrefix(Aligne16dF32)).toBe(4);

    const S4 = d.struct({
      arr: d.arrayOf(d.f32, 16),
      frac: Aligne16dF32,
    });
    expect(d.getLongestContiguousPrefix(S4)).toBe(68);
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
    expect(d.getLongestContiguousPrefix(DeepStruct)).toBe(320);
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
    expect(d.getLongestContiguousPrefix(DeepStruct)).toBe(52);
  });

  it('disarrays and unstructs - simple', () => {
    expect(d.getLongestContiguousPrefix(d.disarrayOf(d.u32, 7))).toBe(28);
    expect(d.getLongestContiguousPrefix(d.disarrayOf(d.vec3f, 7))).toBe(84);
    expect(d.getLongestContiguousPrefix(d.disarrayOf(d.vec4f, 3))).toBe(48);
    expect(d.getLongestContiguousPrefix(d.disarrayOf(d.mat3x3f, 7))).toBe(12);

    expect(
      d.getLongestContiguousPrefix(
        d.unstruct({
          x: d.u32,
          y: d.u32,
        }),
      ),
    ).toBe(8);

    expect(
      d.getLongestContiguousPrefix(
        d.unstruct({
          v: d.vec3f,
          x: d.u32,
        }),
      ),
    ).toBe(16);

    expect(
      d.getLongestContiguousPrefix(
        d.unstruct({
          m: d.mat3x3f,
        }),
      ),
    ).toBe(12);
  });

  it('disarrays and unstructs - decorated elements and fields', () => {
    expect(d.getLongestContiguousPrefix(d.disarrayOf(d.size(4, d.u32), 2))).toBe(8);
    expect(d.getLongestContiguousPrefix(d.disarrayOf(d.align(4, d.u32), 2))).toBe(8);
    expect(d.getLongestContiguousPrefix(d.disarrayOf(d.size(8, d.u32), 2))).toBe(4);
    expect(d.getLongestContiguousPrefix(d.disarrayOf(d.align(8, d.u32), 2))).toBe(4);

    expect(
      d.getLongestContiguousPrefix(
        d.unstruct({
          x: d.size(16, d.u32),
          y: d.u32,
        }),
      ),
    ).toBe(4);

    expect(
      d.getLongestContiguousPrefix(
        d.unstruct({
          x: d.align(8, d.u32),
          y: d.u32,
        }),
      ),
    ).toBe(8);

    expect(
      d.getLongestContiguousPrefix(
        d.unstruct({
          x: d.u32,
          y: d.align(8, d.u32),
        }),
      ),
    ).toBe(4);

    expect(
      d.getLongestContiguousPrefix(
        d.unstruct({
          arr: d.disarrayOf(d.vec3f, 7),
        }),
      ),
    ).toBe(84);

    expect(
      d.getLongestContiguousPrefix(
        d.disarrayOf(
          d.unstruct({
            x: d.vec3f,
          }),
          7,
        ),
      ),
    ).toBe(84);
  });

  describe('edge cases', () => {
    it('two contiguous arrays', () => {
      const S = d.struct({
        arr1: d.arrayOf(d.vec4f, 2),
        arr2: d.arrayOf(d.vec4f, 2),
      });

      expect(d.getLongestContiguousPrefix(S)).toBe(64);
    });

    it('two contiguous structs', () => {
      const InnerS = d.struct({
        x: d.u32,
        y: d.u32,
        vec: d.vec2f,
      });
      const S = d.struct({
        s1: InnerS,
        s2: InnerS,
      });

      expect(d.getLongestContiguousPrefix(S)).toBe(32);
    });

    it('contiguous array and noncontiguous struct', () => {
      const S = d.struct({
        arr: d.arrayOf(d.vec4f, 2),
        s: d.struct({
          x: d.u32,
          vec: d.vec3f,
        }),
      });

      expect(d.getLongestContiguousPrefix(S)).toBe(36);
    });

    it('contiguous array and noncontiguous array', () => {
      const S = d.struct({
        arr1: d.arrayOf(d.vec4f, 2),
        arr2: d.arrayOf(d.vec3f, 2),
      });

      expect(d.getLongestContiguousPrefix(S)).toBe(44);
    });

    it('contiguous struct and noncontiguous array', () => {
      const S = d.struct({
        s: d.struct({
          x: d.u32,
          y: d.u32,
          vec: d.vec2f,
        }),
        arr: d.arrayOf(d.mat3x3f, 2),
      });

      expect(d.getLongestContiguousPrefix(S)).toBe(28);
    });

    it('contiguous struct and noncontiguous struct', () => {
      const S = d.struct({
        s1: d.struct({
          x: d.u32,
          y: d.u32,
          vec: d.vec2f,
        }),
        s2: d.struct({
          x: d.f32,
          l: d.f16,
          vec: d.vec2b,
        }),
      });

      expect(d.getLongestContiguousPrefix(S)).toBe(22);
    });
  });
});
