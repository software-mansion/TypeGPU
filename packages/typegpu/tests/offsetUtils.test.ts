import { describe, expect, it } from 'vitest';
import { d } from '../src/index.js';
import { sizeOf } from '../src/data/sizeOf.ts';

describe('d.memoryLayoutOf (default)', () => {
  it('returns offset 0 and full contiguous size for a scalar', () => {
    const info = d.memoryLayoutOf(d.u32);

    expect(info.offset).toBe(0);
    expect(info.contiguous).toBe(sizeOf(d.u32));
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
  it('computes offsets for array elements without padding', () => {
    const Schema = d.arrayOf(d.u32, 6);

    const info = d.memoryLayoutOf(Schema, (a) => a[3] as number);

    expect(info.offset).toBe(12);
    expect(info.contiguous).toBe(12);
  });

  it('limits contiguous bytes to element size when array stride has padding', () => {
    const Schema = d.arrayOf(d.vec3u, 3);

    const info = d.memoryLayoutOf(Schema, (a) => a[1]?.x as number);

    expect(info.offset).toBe(16);
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
    const info = d.memoryLayoutOf(
      DeepStruct,
      (s) => s.someData[11] as number,
    );

    expect(info.offset).toBe(44);
    expect(info.contiguous).toBe(8);
  });

  it('tracks offsets for nested structs inside arrays', () => {
    const info = d.memoryLayoutOf(
      DeepStruct,
      (s) => s.nested.innerNested[1]?.myVec.x as number,
    );

    expect(info.offset).toBe(128);
    expect(info.contiguous).toBe(28);
  });

  it('tracks offsets inside a later struct run', () => {
    const info = d.memoryLayoutOf(
      DeepStruct,
      (s) => s.nested.additionalData[1] as number,
    );

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

    const info = d.memoryLayoutOf(
      S,
      (s) => s.arr[1]?.vec.x as number,
    );

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

    const info = d.memoryLayoutOf(
      S,
      (s) => s.l.vec.z,
    );

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

    const info = d.memoryLayoutOf(
      S,
      (s) => s.arr[1]?.x.x as number,
    );

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

    const info = d.memoryLayoutOf(
      S,
      (s) => s.arr[0]?.y as number,
    );

    expect(info.offset).toBe(4);
    expect(info.contiguous).toBe(16);
  });
});
