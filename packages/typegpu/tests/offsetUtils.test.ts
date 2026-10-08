import { describe, expect, it } from 'vitest';
import { d } from 'typegpu';
import { sizeOf } from 'typegpu/data';

describe('d.memoryLayoutOf (default)', () => {
  it('returns offset 0 and full contiguous size for a scalar', () => {
    const info = d.memoryLayoutOf(d.u32);

    expect(info.offset).toBe(0);
    expect(info.contiguous).toBe(sizeOf(d.u32));
  });

  it('returns offset 0 and contiguous size for a vector', () => {
    const info = d.memoryLayoutOf(d.vec3f);

    expect(info.offset).toBe(0);
    expect(info.contiguous).toBe(12);
  });

  it('returns offset 0 and contiguous size limited by padding for a struct', () => {
    const Schema = d.struct({
      a: d.u32,
      b: d.vec3f,
    });

    const info = d.memoryLayoutOf(Schema);

    expect(info.offset).toBe(0);
    expect(info.contiguous).toBe(4);
  });
});

describe('d.memoryLayoutOf (matrices)', () => {
  it('respects matrix column padding (without offset proxy)', () => {
    const info = d.memoryLayoutOf(d.mat3x3f);

    expect(info.offset).toBe(0);
    expect(info.contiguous).toBe(12);
  });

  it('respects matrix column padding (with offset proxy)', () => {
    const expected = { offset: 0, contiguous: 12 };

    expect(d.memoryLayoutOf(d.mat3x3f, (m) => m)).toStrictEqual(expected);
    expect(d.memoryLayoutOf(d.mat3x3f, (m) => m.columns)).toStrictEqual(expected);
  });

  it('computes offsets of matrix columns', () => {
    expect(d.memoryLayoutOf(d.mat3x3f, (m) => m.columns[1])).toStrictEqual({
      offset: 16,
      contiguous: 12,
    });

    expect(d.memoryLayoutOf(d.mat3x3f, (m) => m.columns[2].y)).toStrictEqual({
      offset: 36,
      contiguous: 8,
    });
  });

  it('computes offsets of flat matrix elements', () => {
    expect(d.memoryLayoutOf(d.mat3x3f, (m) => m[4])).toStrictEqual({ offset: 16, contiguous: 12 });
  });

  it('throws when accessing matrix padding or out of range elements', () => {
    expect(() => d.memoryLayoutOf(d.mat3x3f, (m) => m[3])).toThrowErrorMatchingInlineSnapshot(
      `[Error: memoryLayoutOf: accessor did not return a schema element. Make sure the accessor navigates to a field or element of the schema (e.g. \`(s) => s.position.x\`).]`,
    );

    expect(() =>
      d.memoryLayoutOf(d.mat3x3f, (m) => (m.columns as unknown as d.v3f[])[3]),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: memoryLayoutOf: accessor did not return a schema element. Make sure the accessor navigates to a field or element of the schema (e.g. \`(s) => s.position.x\`).]`,
    );
  });

  it('continues from the last matrix element into the next prop', () => {
    const Schema = d.struct({ m: d.mat4x4f, after: d.u32 });

    expect(d.memoryLayoutOf(Schema, (s) => s.m)).toStrictEqual({ offset: 0, contiguous: 68 });
    expect(d.memoryLayoutOf(Schema, (s) => s.m.columns[1].w)).toStrictEqual({
      offset: 28,
      contiguous: 40,
    });
  });

  it('respects matrix column padding when followed by a runtime-sized array', () => {
    const Schema = d.struct({ m: d.mat3x3f, items: d.arrayOf(d.u32, 0) });

    expect(d.memoryLayoutOf(Schema, (s) => s.m)).toStrictEqual({ offset: 0, contiguous: 12 });
    expect(d.memoryLayoutOf(Schema, (s) => s.m[10])).toStrictEqual({ offset: 40, contiguous: 4 });
  });

  it('reports the whole matrix as contiguous for matrices without padding', () => {
    expect(d.memoryLayoutOf(d.mat2x2f, (m) => m)).toStrictEqual({ offset: 0, contiguous: 16 });
  });

  it('computes offsets of matrix columns for matrices without padding', () => {
    expect(d.memoryLayoutOf(d.mat4x4f, (m) => m.columns[1].y)).toStrictEqual({
      offset: 20,
      contiguous: 44,
    });
  });

  it('reports NaN for matrices without padding followed by a runtime-sized array', () => {
    const Schema = d.struct({ m: d.mat2x2f, items: d.arrayOf(d.u32, 0) });

    expect(d.memoryLayoutOf(Schema, (s) => s.m.columns[1].y)).toStrictEqual({
      offset: 12,
      contiguous: NaN,
    });
  });
});

describe('d.memoryLayoutOf (vectors)', () => {
  it('computes component offsets and remaining contiguous bytes', () => {
    const info = d.memoryLayoutOf(d.vec4u, (v) => v.z);

    expect(info.offset).toBe(8);
    expect(info.contiguous).toBe(8);
  });

  it('supports numeric component access', () => {
    const info = d.memoryLayoutOf(d.vec3f, (v) => v[1]);

    expect(info.offset).toBe(4);
    expect(info.contiguous).toBe(8);
  });
});

describe('d.memoryLayoutOf (arrays)', () => {
  describe('reports all remaining bytes for contiguous array', () => {
    const Schema = d.arrayOf(d.u32, 6);

    it('without offset proxy', () => {
      expect(d.memoryLayoutOf(Schema).contiguous).toBe(24);
    });

    it('with offset proxy', () => {
      const info = d.memoryLayoutOf(Schema, (a) => a[3]);

      expect(info.offset).toBe(12);
      expect(info.contiguous).toBe(12);
    });
  });

  describe('limits contiguous bytes to element size when array stride has padding', () => {
    const Schema = d.arrayOf(d.vec3u, 3);

    it('without offset proxy', () => {
      expect(d.memoryLayoutOf(Schema).contiguous).toBe(12);
    });

    it('with offset proxy', () => {
      const info = d.memoryLayoutOf(Schema, (a) => a[1]?.x);

      expect(info.offset).toBe(16);
      expect(info.contiguous).toBe(12);
    });
  });

  describe('limits contiguous bytes to element LCP when element is not contiguous', () => {
    const Schema = d.arrayOf(d.struct({ a: d.u32, b: d.vec4u }), 2);

    it('without offset proxy', () => {
      expect(d.memoryLayoutOf(Schema).contiguous).toBe(4);
    });

    it('with offset proxy', () => {
      const info = d.memoryLayoutOf(Schema, (a) => a[1]?.a);

      expect(info.offset).toBe(32);
      expect(info.contiguous).toBe(4);
    });
  });

  describe('reports NaN for contiguous array followed by contiguous runtime-sized array', () => {
    const Schema = d.struct({ arr: d.arrayOf(d.u32, 4), items: d.arrayOf(d.u32, 0) });

    it('without offset proxy', () => {
      expect(d.memoryLayoutOf(Schema).contiguous).toBe(NaN);
    });

    it('with offset proxy', () => {
      const info = d.memoryLayoutOf(Schema, (s) => s.arr[1]);

      expect(info.offset).toBe(4);
      expect(info.contiguous).toBe(NaN);
    });
  });

  describe('limits contiguous bytes to element LCP, but continues from the last element into contiguous runtime-sized array', () => {
    const Schema = d.struct({
      arr: d.arrayOf(d.struct({ a: d.u32, b: d.vec4u }), 2),
      items: d.arrayOf(d.u32, 0),
    });

    it('without offset proxy', () => {
      expect(d.memoryLayoutOf(Schema).contiguous).toBe(4);
    });

    it('with offset proxy', () => {
      const info = d.memoryLayoutOf(Schema, (s) => s.arr[1]?.b.x);

      expect(info.offset).toBe(48);
      expect(info.contiguous).toBe(NaN);
    });
  });

  it('supports accessing the last element using length', () => {
    const Schema = d.arrayOf(d.vec3f, 4);

    const info = d.memoryLayoutOf(Schema, (a) => a[a.length - 1]);

    expect(info.offset).toBe(48);
    expect(info.contiguous).toBe(12);
  });
});

describe('d.memoryLayoutOf (struct runs)', () => {
  it('returns contiguous bytes within a packed run', () => {
    const Schema = d.struct({
      a: d.u32,
      b: d.u32,
      c: d.u32,
    });

    const info = d.memoryLayoutOf(Schema, (s) => s.b);

    expect(info.offset).toBe(4);
    expect(info.contiguous).toBe(8);
  });

  it('clips contiguous bytes at padding boundary', () => {
    const Schema = d.struct({
      a: d.u32,
      b: d.vec3u,
    });

    const info = d.memoryLayoutOf(Schema, (s) => s.a);

    expect(info.offset).toBe(0);
    expect(info.contiguous).toBe(4);
  });

  it('respects custom prop sizes (without offset proxy)', () => {
    const Schema = d.struct({ a: d.size(16, d.u32), b: d.u32 });

    const info = d.memoryLayoutOf(Schema);

    expect(info.offset).toBe(0);
    expect(info.contiguous).toBe(4);
  });

  it('respects custom prop sizes (with offset proxy)', () => {
    const Schema = d.struct({ a: d.size(16, d.u32), b: d.u32 });

    const info = d.memoryLayoutOf(Schema, (s) => s.a);

    expect(info.offset).toBe(0);
    expect(info.contiguous).toBe(4);
  });
});

describe('d.memoryLayoutOf (runtime-sized arrays)', () => {
  it('reports the known contiguous prefix for array of contiguous elements with padding', () => {
    const Schema = d.arrayOf(d.vec3f, 0);

    const info = d.memoryLayoutOf(Schema);

    expect(info.contiguous).toBe(12);
  });

  it('reports the known contiguous prefix for array of non-contiguous elements', () => {
    const Schema = d.arrayOf(d.struct({ x: d.u32, y: d.vec4u }), 0);

    const info = d.memoryLayoutOf(Schema);

    expect(info.contiguous).toBe(4);
  });

  it('reports NaN for the contiguous prefix for array of contiguous elements without padding', () => {
    const Schema = d.arrayOf(d.vec4f, 0);

    const info = d.memoryLayoutOf(Schema);

    expect(info.contiguous).toBe(NaN);
  });
});

describe('d.memoryLayoutOf (runtime-sized structs)', () => {
  it('extends the prefix if trailing runtime-sized array is non-contiguous', () => {
    const Schema = d.struct({
      header: d.vec4f,
      items: d.arrayOf(d.vec3u, 0),
    });

    const info = d.memoryLayoutOf(Schema);

    expect(info.contiguous).toBe(28);
  });

  it('reports NaN if trailing runtime-sized array is contiguous', () => {
    const Schema = d.struct({
      header: d.vec4f,
      items: d.arrayOf(d.vec4u, 0),
    });

    const info = d.memoryLayoutOf(Schema);

    expect(info.contiguous).toBe(NaN);
  });
});

describe('d.memoryLayoutOf (nested layouts)', () => {
  // offset calculator for this struct: https://shorturl.at/NQggS
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

  it('tracks offsets and contiguous bytes within nested arrays', () => {
    const info = d.memoryLayoutOf(DeepStruct, (s) => s.someData[11]);

    expect(info.offset).toBe(44);
    expect(info.contiguous).toBe(8);
  });

  it('tracks offsets for nested structs inside arrays', () => {
    const info = d.memoryLayoutOf(DeepStruct, (s) => s.nested.innerNested[1]?.myVec.x);

    expect(info.offset).toBe(128);
    expect(info.contiguous).toBe(28);
  });

  it('tracks offsets inside a later struct run', () => {
    const info = d.memoryLayoutOf(DeepStruct, (s) => s.nested.additionalData[1]);

    expect(info.offset).toBe(184);
    expect(info.contiguous).toBe(124);
  });
});

describe('d.memoryLayoutOf (edge cases)', () => {
  it('tracks offsets between array elements', () => {
    const E = d.struct({
      x: d.u32,
      vec: d.vec4u,
    });

    const S = d.struct({
      arr: d.arrayOf(E, 3),
    });

    const info = d.memoryLayoutOf(S, (s) => s.arr[1]?.vec.x);

    expect(info.offset).toBe(48);
    expect(info.contiguous).toBe(20);
  });

  it('tracks offsets between structs', () => {
    const I = d.struct({
      vec: d.vec4u,
    });

    const S = d.struct({
      l: I,
      r: I,
    });

    const info = d.memoryLayoutOf(S, (s) => s.l.vec.z);

    expect(info.offset).toBe(8);
    expect(info.contiguous).toBe(24);
  });

  it('tracks offsets between vectors', () => {
    const E = d.struct({
      x: d.vec4u,
      y: d.vec4u,
      z: d.vec4u,
      w: d.vec4u,
    });

    const S = d.struct({
      arr: d.arrayOf(E, 4),
    });

    const info = d.memoryLayoutOf(S, (s) => s.arr[1]?.x.x);

    expect(info.offset).toBe(64);
    expect(info.contiguous).toBe(192);
  });

  it('tracks offsets between array last element and struct', () => {
    const I = d.struct({
      x: d.u32,
      vec: d.vec4u,
    });
    const S = d.struct({
      arr: d.arrayOf(d.vec4u, 1),
      s: I,
    });

    const info = d.memoryLayoutOf(S, (s) => s.arr[0]?.y);

    expect(info.offset).toBe(4);
    expect(info.contiguous).toBe(16);
  });

  it('continues from the last array element into the next prop', () => {
    const S = d.struct({ a: d.u32, b: d.vec4u });
    const Schema = d.struct({ arr: d.arrayOf(S, 2), t: d.vec4u });

    const info = d.memoryLayoutOf(Schema, (s) => s.arr[1]!.b.w);

    expect(info.offset).toBe(60);
    expect(info.contiguous).toBe(20);
  });

  it('stops at padding that follows an array of non-contiguous elements', () => {
    const S = d.struct({ a: d.u32, b: d.vec4u });
    const Schema = d.struct({ arr: d.arrayOf(S, 1), t: d.align(64, d.u32) });

    const info = d.memoryLayoutOf(Schema, (s) => s.arr[0]!.b.w);

    expect(info.offset).toBe(28);
    expect(info.contiguous).toBe(4);
  });

  it('contiguous range stops at the end of the allocation', () => {
    const Schema = d.arrayOf(d.struct({ a: d.u32, b: d.vec4u }), 2);
    const info = d.memoryLayoutOf(Schema, (array) => array[1]!.b.z);

    expect(info.offset).toBe(56);
    expect(info.contiguous).toBe(8);

    expect(info.offset + info.contiguous).toBeLessThanOrEqual(d.sizeOf(Schema));
  });
});
