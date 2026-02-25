import { describe, expect, it } from 'vitest';
import {
  vec2f,
  vec2i,
  vec2u,
  vec3f,
  vec3i,
  vec3u,
  vec4f,
  vec4i,
  vec4u,
} from '../../src/data/vector.ts';
import tgpu, { d, std } from '../../src/index.js';

describe('bitcast', () => {
  it('bitcastU32toF32', () => {
    // 1.0 in f32
    //0 01111111 00000000000000000000000
    const f = std.bitcastU32toF32(1065353216);
    expect(f).toBeCloseTo(1.0);

    // -1 in f32
    //1 01111111 00000000000000000000000
    const f2 = std.bitcastU32toF32(3212836864);
    expect(f2).toBeCloseTo(-1.0);
  });

  it('bitcastU32toI32', () => {
    // -1 in i32
    // 1111111111111111111111111111111
    const i = std.bitcastU32toI32(4294967295);
    expect(i).toBe(-1);

    // -2147483648 in i32
    // 10000000000000000000000000000000
    const i2 = std.bitcastU32toI32(2147483648);
    expect(i2).toBe(-2147483648);
  });

  it('bitcastU32toF32 vectors', () => {
    const v2 = vec2u(1065353216, 3212836864); // 1.0f, -1.0f
    const cast2 = std.bitcastU32toF32(v2);
    expect(std.isCloseTo(cast2, vec2f(1.0, -1.0))).toBe(true);

    const v3 = vec3u(0, 1065353216, 3212836864); // 0.0f, 1.0f, -1.0f
    const cast3 = std.bitcastU32toF32(v3);
    expect(std.isCloseTo(cast3, vec3f(0.0, 1.0, -1.0))).toBe(true);

    const v4 = vec4u(0, 1065353216, 3212836864, 0); // 0,1,-1,0
    const cast4 = std.bitcastU32toF32(v4);
    expect(std.isCloseTo(cast4, vec4f(0.0, 1.0, -1.0, 0.0))).toBe(true);
  });

  it('bitcastU32toI32 vectors', () => {
    const v2 = vec2u(4294967295, 2147483648); // -1, -2147483648
    const cast2 = std.bitcastU32toI32(v2); // int vector
    expect(cast2).toEqual(vec2i(-1, -2147483648));

    const v3 = vec3u(0, 4294967295, 2147483648);
    const cast3 = std.bitcastU32toI32(v3);
    expect(cast3).toEqual(vec3i(0, -1, -2147483648));

    const v4 = vec4u(0, 1, 4294967295, 2147483648);
    const cast4 = std.bitcastU32toI32(v4);
    expect(cast4).toEqual(vec4i(0, 1, -1, -2147483648));
  });

  it('bitcastU32toF32 specials (NaN, infinities etc)', () => {
    // +0
    const pz = std.bitcastU32toF32(0x00000000);
    expect(Object.is(pz, 0)).toBe(true);
    expect(1 / pz).toBe(Number.POSITIVE_INFINITY);

    // -0
    const nz = std.bitcastU32toF32(0x80000000);
    expect(Object.is(nz, -0)).toBe(true);
    expect(1 / nz).toBe(Number.NEGATIVE_INFINITY);

    // +Inf / -Inf
    expect(std.bitcastU32toF32(0x7f800000)).toBe(Number.POSITIVE_INFINITY);
    expect(std.bitcastU32toF32(0xff800000)).toBe(Number.NEGATIVE_INFINITY);

    // NaNs
    const qnan = std.bitcastU32toF32(0x7fc00000);
    const snan = std.bitcastU32toF32(0x7f800001);
    expect(Number.isNaN(qnan)).toBe(true);
    expect(Number.isNaN(snan)).toBe(true);

    // Smallest positive subnormal
    const sub = std.bitcastU32toF32(0x00000001);
    expect(sub).toBeGreaterThan(0);
    expect(sub).toBeLessThan(1e-44);

    // Smallest negative subnormal
    const nsub = std.bitcastU32toF32(0x80000001);
    expect(nsub).toBeLessThan(0);
    expect(nsub).toBeGreaterThan(-1e-44);
  });

  it('bitcastU32toF32 vector specials', () => {
    const v = vec4u(0x7f800000, 0xff800000, 0x7fc00000, 0x80000000);
    const cast = std.bitcastU32toF32(v);
    expect(cast.x).toBe(Number.POSITIVE_INFINITY);
    expect(cast.y).toBe(Number.NEGATIVE_INFINITY);
    expect(Number.isNaN(cast.z)).toBe(true);
    expect(Object.is(cast.w, -0)).toBe(true);
  });

  it('bitcastU32toI32 more edges', () => {
    // Scalars
    expect(std.bitcastU32toI32(0x00000000)).toBe(0);
    expect(std.bitcastU32toI32(0x00000001)).toBe(1);
    expect(std.bitcastU32toI32(0x7fffffff)).toBe(2147483647);
    expect(std.bitcastU32toI32(0xffffffff)).toBe(-1);

    // Vectors
    const v3 = vec3u(0x00000000, 0x80000000, 0xffffffff);
    const c3 = std.bitcastU32toI32(v3);
    expect(c3).toEqual(vec3i(0, -2147483648, -1));

    const v4 = vec4u(0x80000000, 0x00000001, 0x00000000, 0x7fffffff);
    const c4 = std.bitcastU32toI32(v4);
    expect(c4).toEqual(vec4i(-2147483648, 1, 0, 2147483647));
  });
});

describe('bitcast in shaders', () => {
  it('works for primitives', () => {
    const fnf32 = tgpu.fn([], d.f32)(() => std.bitcastU32toF32(1234));
    const fni32 = tgpu.fn([], d.i32)(() => std.bitcastU32toI32(d.u32(2 ** 31)));

    expect(tgpu.resolve([fnf32])).toMatchInlineSnapshot(`
      "fn fnf32() -> f32 {
        return 1.7292023049768243e-42f;
      }"
    `);
    expect(tgpu.resolve([fni32])).toMatchInlineSnapshot(`
      "fn fni32() -> i32 {
        return -2147483648i;
      }"
    `);
  });

  it('works for vectors', () => {
    const fnvec4i = tgpu.fn([], d.vec4i)(() => std.bitcastU32toI32(vec4u(1, 2, 3, 4)));
    const fnvec4f = tgpu.fn([], d.vec4f)(() => std.bitcastU32toF32(vec4u(1, 2, 3, 4)));

    expect(tgpu.resolve([fnvec4i])).toMatchInlineSnapshot(`
    "fn fnvec4i() -> vec4i {
      return vec4i(1, 2, 3, 4);
    }"
  `);
    expect(tgpu.resolve([fnvec4f])).toMatchInlineSnapshot(`
    "fn fnvec4f() -> vec4f {
      return vec4f(1.401298464324817e-45, 2.802596928649634e-45, 4.203895392974451e-45, 5.605193857299268e-45);
    }"
  `);
  });
});
