import { describe, expect, it } from 'vitest';
import {
  align,
  float32x3,
  looseArrayOf,
  looseStruct,
  sint16x2,
  sint16x4,
  unorm8x2,
  unorm10_10_10_2,
  vec2f,
  vec3f,
  vec3u,
} from '../src/data';

describe('looseStruct', () => {
  it('properly calculates size with only loose members', () => {
    const s = looseStruct({
      a: unorm8x2, // 1 byte * 2 = 2
      b: sint16x2, // 2 bytes * 2 = 4
      c: float32x3, // 4 bytes * 3 = 12
      // Total: 2 + 4 + 12 = 18
    });
    expect(s.size).toEqual(18);

    const s2 = looseStruct({
      a: unorm10_10_10_2, // 4 bytes
      b: sint16x4, // 2 bytes * 4 = 8
      // Total: 4 + 8 = 12
    });
    expect(s2.size).toEqual(12);
  });

  it('properly calculates size with only aligned members', () => {
    const s = looseStruct({
      a: align(16, unorm8x2), // 2 bytes
      b: align(16, sint16x2), // 14 padding bytes + 4 bytes = 18
      c: align(16, float32x3), // 12 padding bytes + 12 bytes = 24
      // Total: 2 + 18 + 24 = 44
    });
    expect(s.size).toEqual(44);

    const s2 = looseStruct({
      a: align(16, unorm10_10_10_2), // 4 bytes
      b: align(16, sint16x4), // 12 padding bytes + 8 bytes = 20
      c: vec3f, // 8 padding bytes + 12 bytes = 20
      // Total: 4 + 20 + 20 = 44
    });
    expect(s2.size).toEqual(44);

    const s3 = looseStruct({
      a: vec2f, // 8 bytes
      b: vec3u, // 8 padding bytes + 12 bytes = 20
      // Total: 8 + 20 = 28
    });
    expect(s3.size).toEqual(28);
  });

  it('properly calculates size with mixed members', () => {
    const s = looseStruct({
      a: unorm8x2, // 2 bytes
      b: align(16, sint16x2), // 14 padding bytes + 4 bytes = 18
      c: float32x3, // 12 bytes
      // Total: 2 + 18 + 12 = 32
    });
    expect(s.size).toEqual(32);

    const s2 = looseStruct({
      a: align(16, unorm10_10_10_2), // 4 bytes
      b: sint16x4, // 8 bytes
      c: vec3f, // 4 padding bytes + 12 bytes = 16
      // Total: 4 + 8 + 16 = 28
    });
    expect(s2.size).toEqual(28);

    const s3 = looseStruct({
      a: vec2f, // 8 bytes
      b: align(16, vec3u), // 8 padding bytes + 12 bytes = 20
      c: unorm10_10_10_2, // 4 bytes
      // Total: 8 + 20 + 4 = 32
    });
    expect(s3.size).toEqual(32);
  });

  it('properly calculates size when nested and combined with looseArrayOf', () => {
    const s = looseStruct({
      a: unorm8x2, // 2 bytes
      b: align(16, sint16x2), // 14 padding bytes + 4 bytes = 18
      c: looseArrayOf(vec3f, 2), // 12 bytes * 2 = 24
      // Total: 2 + 18 + 24 = 44
    });
    expect(s.size).toEqual(44);

    const s2 = looseStruct({
      a: align(16, unorm10_10_10_2), // 4 bytes
      b: sint16x4, // 8 bytes
      c: looseArrayOf(vec3f, 2), // 12 bytes * 2 = 24
      // Total: 4 + 8 + 24 = 36
    });
    expect(s2.size).toEqual(36);

    const s3 = looseStruct({
      a: vec2f, // 8 bytes
      b: align(16, vec3u), // 8 padding bytes + 12 bytes = 20
      c: s2, // 4 padding bytes + 36 bytes = 40
      // Total: 8 + 20 + 40 = 68
    });
    expect(s3.size).toEqual(68);
  });
});
