import { describe, expect, it } from 'vitest';
import { d } from '../src/index.ts';
import { sizeOf } from '../src/data/schemaMemoryLayout.ts';
import { getOffsetInfoAt } from '../src/data/offsetUtils.ts';

describe('getOffsetInfoAt (default)', () => {
  it('returns offset 0 and full contiguous size for a scalar', () => {
    const info = getOffsetInfoAt(d.u32);

    expect(info.offset).toBe(0);
    expect(info.contiguous).toBe(sizeOf(d.u32));
  });

  it('returns offset 0 and contiguous size limited by padding for a struct', () => {
    const Schema = d.struct({
      a: d.u32,
      b: d.vec3f,
    });

    const info = getOffsetInfoAt(Schema);

    expect(info.offset).toBe(0);
    expect(info.contiguous).toBe(4);
  });
});

describe('getOffsetInfoAt (vectors)', () => {
  it('computes component offsets and remaining contiguous bytes', () => {
    const info = getOffsetInfoAt(d.vec4u, (v) => v.z);

    expect(info.offset).toBe(8);
    expect(info.contiguous).toBe(8);
  });

  it('supports numeric component access', () => {
    const info = getOffsetInfoAt(d.vec3f, (v) => v[1] as number);

    expect(info.offset).toBe(4);
    expect(info.contiguous).toBe(8);
  });
});

describe('getOffsetInfoAt (arrays)', () => {
  it('computes offsets for array elements without padding', () => {
    const Schema = d.arrayOf(d.u32, 6);

    const info = getOffsetInfoAt(Schema, (a) => a[3] as number);

    expect(info.offset).toBe(12);
    expect(info.contiguous).toBe(12);
  });

  it('limits contiguous bytes to element size when array stride has padding', () => {
    const Schema = d.arrayOf(d.vec3u, 3);

    const info = getOffsetInfoAt(Schema, (a) => a[1]?.x as number);

    expect(info.offset).toBe(16);
    expect(info.contiguous).toBe(12);
  });
});

describe('getOffsetInfoAt (struct runs)', () => {
  it('returns contiguous bytes within a packed run', () => {
    const Schema = d.struct({
      a: d.u32,
      b: d.u32,
      c: d.u32,
    });

    const info = getOffsetInfoAt(Schema, (s) => s.b);

    expect(info.offset).toBe(4);
    expect(info.contiguous).toBe(8);
  });

  it('clips contiguous bytes at padding boundary', () => {
    const Schema = d.struct({
      a: d.u32,
      b: d.vec3u,
    });

    const info = getOffsetInfoAt(Schema, (s) => s.a);

    expect(info.offset).toBe(0);
    expect(info.contiguous).toBe(4);
  });
});

describe('getOffsetInfoAt (nested layouts)', () => {
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
    const info = getOffsetInfoAt(
      DeepStruct,
      (s) => s.someData[11] as number,
    );

    expect(info.offset).toBe(44);
    expect(info.contiguous).toBe(8);
  });

  it('tracks offsets for nested structs inside arrays', () => {
    const info = getOffsetInfoAt(
      DeepStruct,
      (s) => s.nested.innerNested[1]?.myVec.x as number,
    );

    expect(info.offset).toBe(128);
    expect(info.contiguous).toBe(28);
  });

  it('tracks offsets inside a later struct run', () => {
    const info = getOffsetInfoAt(
      DeepStruct,
      (s) => s.nested.additionalData[1] as number,
    );

    expect(info.offset).toBe(184);
    expect(info.contiguous).toBe(124); // didn't check that
  });

  it('test1', () => {
    const ReproInner = d.struct({
      x: d.u32,
      vec: d.vec4u,
    });

    const Repro = d.struct({
      arr: d.arrayOf(ReproInner, 3),
    });

    const info = getOffsetInfoAt(
      Repro,
      (r) => r.arr[1]?.vec.x as number,
    );

    expect(info.offset).toBe(48);
    expect(info.contiguous).toBe(20);
  });

  it('test2', () => {
    const ReproInner = d.struct({
      vec: d.vec4u,
    });

    const Repro = d.struct({
      x: ReproInner,
      y: ReproInner,
    });

    const info = getOffsetInfoAt(
      Repro,
      (r) => r.x.vec.z as number,
    );

    expect(info.offset).toBe(8);
    expect(info.contiguous).toBe(24);
  });

  it('test3', () => {
    const ReproInner = d.struct({
      x: d.vec4u,
      y: d.vec4u,
      z: d.vec4u,
      w: d.vec4u,
    });

    const Repro = d.struct({
      arr: d.arrayOf(ReproInner, 4),
    });

    const info = getOffsetInfoAt(
      Repro,
      (r) => r.arr[1]?.x.x as number,
    );

    expect(info.offset).toBe(64);
    expect(info.contiguous).toBe(192);
  });

  it('test4', () => {
    const ReproInner = d.struct({
      x: d.vec4u,
    });

    const Repro = d.struct({
      y: d.u32,
      x: d.align(16, d.u32),
      inner: ReproInner,
    });

    const info = getOffsetInfoAt(
      Repro,
      (r) => r.x as number,
    );

    expect(info.offset).toBe(16);
    expect(info.contiguous).toBe(4);
  });

  it('test5', () => {
    const Repro1 = d.struct({
      arr: d.arrayOf(d.arrayOf(d.vec3f, 3), 2),
    });

    const Repro2 = d.struct({
      arr: d.arrayOf(d.arrayOf(d.vec2f, 2), 2),
    });

    const info1 = getOffsetInfoAt(
      Repro1,
      (r) => r.arr[0]?.[0]?.x as number,
    );

    const info2 = getOffsetInfoAt(
      Repro2,
      (r) => r.arr[0]?.[0]?.x as number,
    );

    expect(info1.offset).toBe(0);
    expect(info1.contiguous).toBe(12);
    expect(info2.offset).toBe(0);
    expect(info2.contiguous).toBe(32);
  });

  it('test6', () => {
    const ReproInner = d.struct({
      x: d.u32,
      vec: d.vec4u,
    });
    const Repro = d.struct({
      arr: d.arrayOf(d.vec4u, 1),
      s: ReproInner,
    });

    const info = getOffsetInfoAt(
      Repro,
      (r) => r.arr[0]?.y as number,
    );

    expect(info.offset).toBe(4);
    expect(info.contiguous).toBe(16);
  });
});
