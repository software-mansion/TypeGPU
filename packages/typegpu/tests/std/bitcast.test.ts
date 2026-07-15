import { describe, expect, expectTypeOf, it } from 'vitest';
import { vec2f, vec2i, vec2u, vec3f, vec3i, vec3u, vec4f, vec4i, vec4u } from 'typegpu/data';
import { tgpu, d, std } from 'typegpu';
import { bitcast } from '../../src/std/bitcast.ts';

// remember to pad with zeros to 8 hex symbols
const floatFromHex = (hex: string) => Buffer.from(hex, 'hex').readFloatBE(0);

describe('bitcast', () => {
  it('bitcastU32toF32', () => {
    // 1.0 in f32
    //0 01111111 00000000000000000000000
    const f = bitcast(d.u32, d.f32)(1065353216);
    expect(f).toBeCloseTo(1.0);

    // -1 in f32
    //1 01111111 00000000000000000000000
    const f2 = bitcast(d.u32, d.f32)(3212836864);
    expect(f2).toBeCloseTo(-1.0);
  });

  it('bitcastU32toI32', () => {
    // -1 in i32
    // 1111111111111111111111111111111
    const i = bitcast(d.u32, d.i32)(4294967295);
    expect(i).toBe(-1);

    // -2147483648 in i32
    // 10000000000000000000000000000000
    const i2 = bitcast(d.u32, d.i32)(2147483648);
    expect(i2).toBe(-2147483648);
  });

  it('bitcastF32toU32', () => {
    const i1 = bitcast(d.f32, d.u32)(floatFromHex('00000001'));
    expect(i1).toBe(1);

    const i2 = bitcast(d.f32, d.u32)(floatFromHex('7f800000'));
    expect(i2).toBe(2139095040);
  });

  it('bitcastU32toF32 vectors', () => {
    const v2 = vec2u(1065353216, 3212836864); // 1.0f, -1.0f
    const cast2 = bitcast(d.vec2u, d.vec2f)(v2);
    expect(std.isCloseTo(cast2, vec2f(1.0, -1.0))).toBe(true);

    const v3 = vec3u(0, 1065353216, 3212836864); // 0.0f, 1.0f, -1.0f
    const cast3 = bitcast(d.vec3u, d.vec3f)(v3);
    expect(std.isCloseTo(cast3, vec3f(0.0, 1.0, -1.0))).toBe(true);

    const v4 = vec4u(0, 1065353216, 3212836864, 0); // 0,1,-1,0
    const cast4 = bitcast(d.vec4u, d.vec4f)(v4);
    expect(std.isCloseTo(cast4, vec4f(0.0, 1.0, -1.0, 0.0))).toBe(true);
  });

  it('bitcastU32toI32 vectors', () => {
    const v2 = vec2u(4294967295, 2147483648); // -1, -2147483648
    const cast2 = bitcast(d.vec2u, d.vec2i)(v2); // int vector
    expect(cast2).toEqual(vec2i(-1, -2147483648));

    const v3 = vec3u(0, 4294967295, 2147483648);
    const cast3 = bitcast(d.vec3u, d.vec3i)(v3);
    expect(cast3).toEqual(vec3i(0, -1, -2147483648));

    const v4 = vec4u(0, 1, 4294967295, 2147483648);
    const cast4 = bitcast(d.vec4u, d.vec4i)(v4);
    expect(cast4).toEqual(vec4i(0, 1, -1, -2147483648));
  });

  it('bitcastF32toU32 vectors', () => {
    const v2 = vec2f(floatFromHex('7c800001'), floatFromHex('100008c7'));
    const cast2 = bitcast(d.vec2f, d.vec2u)(v2);
    expect(cast2).toStrictEqual(vec2u(2088763393, 268437703));

    const v3 = vec3f(floatFromHex('ff000000'), floatFromHex('00000001'), floatFromHex('80000001'));
    const cast3 = bitcast(d.vec3f, d.vec3u)(v3);
    expect(cast3).toStrictEqual(vec3u(4278190080, 1, 2147483649));

    const v4 = vec4f(
      floatFromHex('84220925'),
      floatFromHex('68800000'),
      floatFromHex('48980780'),
      floatFromHex('0000075a'),
    );
    const cast4 = bitcast(d.vec4f, d.vec4u)(v4);
    expect(cast4).toStrictEqual(vec4u(2216823077, 1753219072, 1217922944, 1882));
  });

  it('bitcastU32toF32 specials', () => {
    // +0
    const pz = bitcast(d.u32, d.f32)(0x00000000);
    expect(Object.is(pz, 0)).toBe(true);
    expect(1 / pz).toBe(Number.POSITIVE_INFINITY);

    // -0
    const nz = bitcast(d.u32, d.f32)(0x80000000);
    expect(Object.is(nz, -0)).toBe(true);
    expect(1 / nz).toBe(Number.NEGATIVE_INFINITY);

    // Smallest positive subnormal
    const sub = bitcast(d.u32, d.f32)(0x00000001);
    expect(sub).toBeGreaterThan(0);
    expect(sub).toBeLessThan(1e-44);

    // Smallest negative subnormal
    const nsub = bitcast(d.u32, d.f32)(0x80000001);
    expect(nsub).toBeLessThan(0);
    expect(nsub).toBeGreaterThan(-1e-44);
  });

  it('bitcastU32toI32 more edges', () => {
    // Scalars
    expect(bitcast(d.u32, d.i32)(0x00000000)).toBe(0);
    expect(bitcast(d.u32, d.i32)(0x00000001)).toBe(1);
    expect(bitcast(d.u32, d.i32)(0x7fffffff)).toBe(2147483647);
    expect(bitcast(d.u32, d.i32)(0xffffffff)).toBe(-1);

    // Vectors
    const v3 = vec3u(0x00000000, 0x80000000, 0xffffffff);
    const c3 = bitcast(d.vec3u, d.vec3i)(v3);
    expect(c3).toEqual(vec3i(0, -2147483648, -1));

    const v4 = vec4u(0x80000000, 0x00000001, 0x00000000, 0x7fffffff);
    const c4 = bitcast(d.vec4u, d.vec4i)(v4);
    expect(c4).toEqual(vec4i(-2147483648, 1, 0, 2147483647));
  });

  it('bitcastF32toU32 specials (NaN, infinities etc)', () => {
    // +0
    expect(bitcast(d.f32, d.u32)(+0)).toBe(0x00000000);

    // -0
    expect(bitcast(d.f32, d.u32)(-0)).toBe(0x80000000);

    // +Inf / -Inf
    expect(bitcast(d.f32, d.u32)(Number.POSITIVE_INFINITY)).toBe(0x7f800000);
    expect(bitcast(d.f32, d.u32)(Number.NEGATIVE_INFINITY)).toBe(0xff800000);

    // NaN
    expect(bitcast(d.f32, d.u32)(Number.NaN)).toBe(0x7fc00000);

    // Smallest positive subnormal
    expect(bitcast(d.f32, d.u32)(floatFromHex('00000001'))).toBe(0x00000001);

    // Smallest negative subnormal
    expect(bitcast(d.f32, d.u32)(floatFromHex('80000001'))).toBe(0x80000001);
  });
});

describe('bitcast in shaders', () => {
  it('works for primitives', () => {
    const fnf32 = tgpu.fn([], d.f32)(() => std.bitcastU32toF32(1234));
    const fni32 = tgpu.fn([], d.i32)(() => std.bitcastU32toI32(d.u32(2 ** 31)));
    const fnu32 = tgpu.fn([d.f32], d.u32)((v) => std.bitcastF32toU32(v));

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
    expect(tgpu.resolve([fnu32])).toMatchInlineSnapshot(`
      "fn fnu32(v: f32) -> u32 {
        return bitcast<u32>(v);
      }"
    `);
  });

  it('works for vectors', () => {
    const fnvec4i = tgpu.fn([], d.vec4i)(() => std.bitcastU32toI32(vec4u(1, 2, 3, 4)));
    const fnvec4f = tgpu.fn([], d.vec4f)(() => std.bitcastU32toF32(vec4u(1, 2, 3, 4)));
    const fnvec4u = tgpu.fn([d.vec4f], d.vec4u)((v) => std.bitcastF32toU32(v));

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
    expect(tgpu.resolve([fnvec4u])).toMatchInlineSnapshot(`
      "fn fnvec4u(v: vec4f) -> vec4u {
        return bitcast<vec4u>(v);
      }"
    `);
  });

  it('throws an error for unsupported signatures', () => {
    const f1 = () => {
      'use gpu';
      // @ts-expect-error
      return std.bitcastU32toF32(d.vec2i());
    };
    expect(() => tgpu.resolve([f1])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f1
      - fn*:f1()
      - fn:bitcastU32toF32: Unsupported data types: vec2i. Supported types are: u32, vec2u, vec3u, vec4u.]
    `);

    const f2 = () => {
      'use gpu';
      // @ts-expect-error
      return std.bitcastU32toI32(d.vec3f());
    };
    expect(() => tgpu.resolve([f2])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f2
      - fn*:f2()
      - fn:bitcastU32toI32: Unsupported data types: vec3f. Supported types are: u32, vec2u, vec3u, vec4u.]
    `);

    const f3 = () => {
      'use gpu';
      // @ts-expect-error
      return std.bitcastF32toU32(d.vec2h());
    };
    expect(() => tgpu.resolve([f3])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f3
      - fn*:f3()
      - fn:bitcastF32toU32: Unsupported data types: vec2h. Supported types are: f32, vec2f, vec3f, vec4f.]
    `);

    const f4 = () => {
      'use gpu';
      const u = d.u32(1);
      return std.bitcastF32toU32(u);
    };
    expect(() => tgpu.resolve([f4])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f4
      - fn*:f4()
      - fn:bitcastF32toU32: Unsupported data types: u32. Supported types are: f32, vec2f, vec3f, vec4f.]
    `);
  });
});
