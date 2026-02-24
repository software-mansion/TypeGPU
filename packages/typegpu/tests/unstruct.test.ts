import { BufferReader, BufferWriter } from 'typed-binary';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { readData, writeData } from '../src/data/dataIO.ts';
import * as d from '../src/data/index.ts';

describe('d.unstruct', () => {
  it('properly calculates size with only loose members', () => {
    const s = d.unstruct({
      a: d.unorm8x2, // 1 byte * 2 = 2
      b: d.sint16x2, // 2 bytes * 2 = 4
      c: d.float32x3, // 4 bytes * 3 = 12
      // Total: 2 + 4 + 12 = 18
    });
    expect(d.sizeOf(s)).toBe(18);

    const s2 = d.unstruct({
      a: d.unorm10_10_10_2, // 4 bytes
      b: d.sint16x4, // 2 bytes * 4 = 8
      // Total: 4 + 8 = 12
    });
    expect(d.sizeOf(s2)).toBe(12);

    const s3 = d.unstruct({
      a: d.vec2f, // 8 bytes
      b: d.vec3u, // 12 bytes
      // Total: 8 + 12 = 20
    });
    expect(d.sizeOf(s3)).toBe(20);
  });

  it('properly calculates size with only aligned members', () => {
    const s = d.unstruct({
      a: d.align(16, d.unorm8x2), // 2 bytes
      b: d.align(16, d.sint16x2), // 14 padding bytes + 4 bytes = 18
      c: d.align(16, d.float32x3), // 12 padding bytes + 12 bytes = 24
      // Total: 2 + 18 + 24 = 44
    });
    expect(d.sizeOf(s)).toBe(44);

    const s2 = d.unstruct({
      a: d.align(16, d.unorm10_10_10_2), // 4 bytes
      b: d.align(16, d.sint16x4), // 12 padding bytes + 8 bytes = 20
      c: d.align(16, d.vec3f), // 8 padding bytes + 12 bytes = 20
      // Total: 4 + 20 + 20 = 44
    });
    expect(d.sizeOf(s2)).toBe(44);
  });

  it('properly calculates size with mixed members', () => {
    const s = d.unstruct({
      a: d.unorm8x2, // 2 bytes
      b: d.align(16, d.sint16x2), // 14 padding bytes + 4 bytes = 18
      c: d.float32x3, // 12 bytes
      // Total: 2 + 18 + 12 = 32
    });
    expect(d.sizeOf(s)).toBe(32);

    const s2 = d.unstruct({
      a: d.align(16, d.unorm10_10_10_2), // 4 bytes
      b: d.sint16x4, // 8 bytes
      c: d.vec3f, // 12 bytes
      // Total: 4 + 8 + 12 = 24
    });
    expect(d.sizeOf(s2)).toBe(24);

    const s3 = d.unstruct({
      a: d.vec2f, // 8 bytes
      b: d.align(16, d.vec3u), // 8 padding bytes + 12 bytes = 20
      c: d.unorm10_10_10_2, // 4 bytes
      // Total: 8 + 20 + 4 = 32
    });
    expect(d.sizeOf(s3)).toBe(32);
  });

  it('properly calculates size when nested and combined with d.disarray', () => {
    const s = d.unstruct({
      a: d.unorm8x2, // 2 bytes
      b: d.align(16, d.sint16x2), // 14 padding bytes + 4 bytes = 18
      c: d.disarrayOf(d.vec3f, 2), // 12 bytes * 2 = 24
      // Total: 2 + 18 + 24 = 44
    });
    expect(d.sizeOf(s)).toBe(44);

    const s2 = d.unstruct({
      a: d.align(16, d.unorm10_10_10_2), // 4 bytes
      b: d.sint16x4, // 8 bytes
      c: d.disarrayOf(d.vec3f, 2), // 12 bytes * 2 = 24
      // Total: 4 + 8 + 24 = 36
    });
    expect(d.sizeOf(s2)).toBe(36);

    const s3 = d.unstruct({
      a: d.vec2f, // 8 bytes
      b: d.align(16, d.vec3u), // 8 padding bytes + 12 bytes = 20
      // Total: 8 + 20 = 28
    });
    expect(d.sizeOf(s3)).toBe(28);

    const s4 = d.unstruct({
      a: d.vec2f, // 8 bytes
      b: d.align(16, d.vec3u), // 8 padding bytes + 12 bytes = 20
      c: s2, // 4 padding bytes + 36 bytes = 40
      // Total: 8 + 20 + 40 = 68
    });
    expect(d.sizeOf(s4)).toBe(68);
  });

  it('properly writes and reads data', () => {
    const s = d.unstruct({
      a: d.unorm8x2,
      b: d.align(16, d.snorm16x2),
      c: d.float32x3,
    });

    const buffer = new ArrayBuffer(d.sizeOf(s));
    const writer = new BufferWriter(buffer);

    writeData(writer, s, {
      a: d.vec2f(0.5, 0.75),
      b: d.vec2f(0.25, 0.5),
      c: d.vec3f(1.0, 2.0, 3.0),
    });

    const reader = new BufferReader(buffer);
    const data = readData(reader, s);

    expect(data.a.x).toBeCloseTo(0.5);
    expect(data.a.y).toBeCloseTo(0.75);
    expect(data.b.x).toBeCloseTo(0.25);
    expect(data.b.y).toBeCloseTo(0.5);
    expect(data.c.x).toBeCloseTo(1.0);
    expect(data.c.y).toBeCloseTo(2.0);
    expect(data.c.z).toBeCloseTo(3.0);
  });

  it('properly writes and reads data with nested unstructs', () => {
    const s = d.unstruct({
      a: d.unorm8x2,
      b: d.align(16, d.snorm16x2),
      c: d.unstruct({
        a: d.float32x3,
        b: d.vec2i,
      }),
    });

    const buffer = new ArrayBuffer(d.sizeOf(s));
    const writer = new BufferWriter(buffer);

    writeData(writer, s, {
      a: d.vec2f(0.5, 0.75),
      b: d.vec2f(0.25, 0.5),
      c: {
        a: d.vec3f(1.0, 2.0, 3.0),
        b: d.vec2i(4, 5),
      },
    });

    const reader = new BufferReader(buffer);
    const data = readData(reader, s);

    expect(data.a.x).toBeCloseTo(0.5);
    expect(data.a.y).toBeCloseTo(0.75);
    expect(data.b.x).toBeCloseTo(0.25);
    expect(data.b.y).toBeCloseTo(0.5);
    expect(data.c.a.x).toBeCloseTo(1.0);
    expect(data.c.a.y).toBeCloseTo(2.0);
    expect(data.c.a.z).toBeCloseTo(3.0);
    expect(data.c.b.x).toBe(4);
    expect(data.c.b.y).toBe(5);
  });

  it('can be custom aligned and behaves properly', () => {
    const s = d.align(
      16,
      d.unstruct({
        a: d.unorm8x2, // 2 bytes
        b: d.align(8, d.snorm16x2), // 6 padding bytes + 4 bytes = 10
      }),
    );

    const a = d.disarrayOf(s, 8);

    expect(d.sizeOf(s)).toBe(12);
    // since the unstruct is aligned to 16 bytes, the array stride should be 16 not 12
    expect(d.sizeOf(a)).toBe(16 * 8);

    const buffer = new ArrayBuffer(d.sizeOf(a));
    const writer = new BufferWriter(buffer);

    writeData(
      writer,
      a,
      Array.from({ length: 8 }, () => ({
        a: d.vec2f(0.5, 0.75),
        b: d.vec2f(-0.25, 0.25),
      })),
    );

    const reader = new BufferReader(buffer);
    const data = readData(reader, a);

    data.forEach((item, _) => {
      expect(item.a.x).toBeCloseTo(0.5);
      expect(item.a.y).toBeCloseTo(0.75);
      expect(item.b.x).toBeCloseTo(-0.25);
      expect(item.b.y).toBeCloseTo(0.25);
    });
  });

  it('works properly in conjunction with f16 based attributes', () => {
    const s = d.unstruct({
      a: d.float16x2,
      b: d.unorm8x4_bgra,
      c: d.align(16, d.snorm16x2),
    });

    const buffer = new ArrayBuffer(d.sizeOf(s));
    const writer = new BufferWriter(buffer);

    writeData(writer, s, {
      a: d.vec2f(0.5, 0.75),
      b: d.vec4f(0.25, 0.5, 0.75, 1.0),
      c: d.vec2f(-0.25, 0.25),
    });

    const reader = new BufferReader(buffer);

    const data = readData(reader, s);

    expect(data.a.x).toBeCloseTo(0.5);
    expect(data.a.y).toBeCloseTo(0.75);
    expect(data.b.x).toBeCloseTo(0.25);
    expect(data.b.y).toBeCloseTo(0.5);
    expect(data.b.z).toBeCloseTo(0.75);
    expect(data.b.w).toBeCloseTo(1.0);
    expect(data.c.x).toBeCloseTo(-0.25);
    expect(data.c.y).toBeCloseTo(0.25);
  });

  it('can be called to create an object', () => {
    const TestUnstruct = d.unstruct({
      x: d.u32,
      y: d.uint32x3,
    });

    const obj = TestUnstruct({ x: 1, y: d.vec3u(1, 2, 3) });

    expect(obj).toStrictEqual({ x: 1, y: d.vec3u(1, 2, 3) });
    expectTypeOf(obj).toEqualTypeOf<{ x: number; y: d.v3u }>();
  });

  it('cannot be called with invalid properties', () => {
    const TestUnstruct = d.unstruct({
      x: d.u32,
      y: d.uint32x3,
    });

    // @ts-expect-error
    (() => TestUnstruct({ x: 1, z: 2 }));
  });

  it('can be called to create a deep copy of other unstruct', () => {
    const NestedUnstruct = d.unstruct({ prop1: d.float32x2, prop2: d.u32 });
    const TestUnstruct = d.unstruct({ nested: NestedUnstruct });
    const instance = TestUnstruct({
      nested: { prop1: d.vec2f(1, 2), prop2: 21 },
    });

    const clone = TestUnstruct(instance);

    expect(clone).toStrictEqual(instance);
    expect(clone).not.toBe(instance);
    expect(clone.nested).not.toBe(instance.nested);
    expect(clone.nested.prop1).not.toBe(instance.nested.prop1);
  });

  it('can be called to strip extra properties of a unstruct', () => {
    const TestUnstruct = d.unstruct({ prop1: d.vec2f, prop2: d.u32 });
    const instance = { prop1: d.vec2f(1, 2), prop2: 21, prop3: 'extra' };

    const clone = TestUnstruct(instance);

    expect(clone).toStrictEqual({ prop1: d.vec2f(1, 2), prop2: 21 });
  });

  it('can be called to create a default value', () => {
    const TestUnstruct = d.unstruct({
      nested: d.unstruct({ prop1: d.vec2f, prop2: d.u32 }),
    });

    const defaultStruct = TestUnstruct();

    expect(defaultStruct).toStrictEqual({
      nested: { prop1: d.vec2f(), prop2: d.u32() },
    });
  });

  it('can be called to create a default value with nested disarray', () => {
    const TestUnstruct = d.unstruct({ arr: d.disarrayOf(d.uint16, 1) });

    const defaultStruct = TestUnstruct();

    expect(defaultStruct).toStrictEqual({ arr: [0] });
  });
});
