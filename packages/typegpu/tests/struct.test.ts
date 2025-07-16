import { BufferReader, BufferWriter } from 'typed-binary';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { readData, writeData } from '../src/data/dataIO.ts';
import {
  alignmentOf,
  arrayOf,
  f16,
  f32,
  i32,
  sizeOf,
  struct,
  u32,
  type v3u,
  vec2f,
  vec2h,
  vec2u,
  vec3f,
  vec3h,
  vec3u,
} from '../src/data/index.ts';
import type { Infer } from '../src/shared/repr.ts';

describe('struct', () => {
  it('aligns struct properties when measuring', () => {
    const TestStruct = struct({
      x: u32,
      y: vec3u,
    });
    expect(sizeOf(TestStruct)).toBe(32);
  });

  it('aligns struct properties when writing', () => {
    const TestStruct = struct({
      x: u32,
      y: vec3u,
    });

    const buffer = new ArrayBuffer(sizeOf(TestStruct));
    const writer = new BufferWriter(buffer);

    writeData(writer, TestStruct, { x: 1, y: vec3u(1, 2, 3) });
    // deno-fmt-ignore
    expect([...new Uint32Array(buffer)]).toStrictEqual([
      1, 0, 0, 0, 1, 2, 3, 0,
    ]);
  });

  it('aligns struct properties when reading', () => {
    const TestStruct = struct({
      x: u32,
      y: vec3u,
    });

    const buffer = new ArrayBuffer(sizeOf(TestStruct));
    const reader = new BufferReader(buffer);

    new Uint32Array(buffer).set([3, 0, 0, 0, 4, 5, 6]);

    expect(readData(reader, TestStruct)).toStrictEqual({
      x: 3,
      y: vec3u(4, 5, 6),
    });
  });

  it('encodes and decodes structures properly', () => {
    const TestStruct = struct({
      a: u32,
      b: vec3u,
      c: vec3f,
      d: f32,
      e: i32,
      f: struct({
        g: f32,
        h: vec3u,
        i: vec2u,
        j: u32,
      }),
    });

    const buffer = new ArrayBuffer(sizeOf(TestStruct));

    const value: Infer<typeof TestStruct> = {
      a: 1,
      b: vec3u(2, 3, 4),
      c: vec3f(6.5, 7.5, 8.5),
      d: 9.5,
      e: -1,
      f: {
        g: -10.5,
        h: vec3u(11, 12, 13),
        i: vec2u(14, 15),
        j: 16,
      },
    };

    writeData(new BufferWriter(buffer), TestStruct, value);
    expect(readData(new BufferReader(buffer), TestStruct)).toStrictEqual(value);
  });

  it('allows for runtime sized arrays as last property', () => {
    const Unbounded = struct({
      a: u32,
      b: vec3u,
      c: arrayOf(u32, 0),
    });

    expect(sizeOf(Unbounded)).toBeNaN();

    {
      const Invalid = struct({
        a: u32,
        b: arrayOf(u32, 0),
        c: vec3u,
      });

      expect(() => {
        sizeOf(Invalid);
      }).toThrow();
    }

    {
      const Invalid = struct({
        a: u32,
        b: arrayOf(u32, 0),
        c: arrayOf(u32, 0),
      });

      expect(() => {
        sizeOf(Invalid);
      }).toThrow();
    }

    {
      const Invalid = struct({
        a: u32,
        b: Unbounded,
      });

      expect(() => {
        sizeOf(Invalid);
      }).toThrow();
    }
  });

  it('supports f16', () => {
    const TestStruct = struct({
      a: f16,
      b: f16,
      c: f16,
      d: f16,
    });

    expect(sizeOf(TestStruct)).toBe(8);
    expect(alignmentOf(TestStruct)).toBe(2);

    const buffer = new ArrayBuffer(sizeOf(TestStruct));

    const value: Infer<typeof TestStruct> = {
      a: 1.0,
      b: 2.0,
      c: 3.0,
      d: 4.0,
    };

    writeData(new BufferWriter(buffer), TestStruct, value);
    expect(readData(new BufferReader(buffer), TestStruct)).toStrictEqual(value);
  });

  it('properly aligns with f16', () => {
    const TestStruct = struct({
      a: u32,
      b: f16,
      c: u32,
    });

    expect(sizeOf(TestStruct)).toBe(12);
    expect(alignmentOf(TestStruct)).toBe(4);

    const buffer = new ArrayBuffer(sizeOf(TestStruct));

    const value: Infer<typeof TestStruct> = {
      a: 1,
      b: 2.0,
      c: 3,
    };

    writeData(new BufferWriter(buffer), TestStruct, value);
    expect(readData(new BufferReader(buffer), TestStruct)).toStrictEqual(value);
  });

  it('supports and properly aligns with vectors of f16', () => {
    const TestStruct = struct({
      a: vec3h,
      b: f16,
    });

    expect(sizeOf(TestStruct)).toBe(8);
    expect(alignmentOf(TestStruct)).toBe(8);

    const buffer = new ArrayBuffer(sizeOf(TestStruct));

    const value: Infer<typeof TestStruct> = {
      a: vec3h(1.0, 2.0, 3.0),
      b: 4.0,
    };

    writeData(new BufferWriter(buffer), TestStruct, value);
    expect(readData(new BufferReader(buffer), TestStruct)).toStrictEqual(value);

    const TestStruct2 = struct({
      a: vec2h,
      b: struct({
        aa: arrayOf(vec3h, 2),
        bb: f16,
      }),
      c: vec2h,
    });

    expect(sizeOf(TestStruct2)).toBe(40);

    const buffer2 = new ArrayBuffer(sizeOf(TestStruct2));

    const value2: Infer<typeof TestStruct2> = {
      a: vec2h(1.0, 2.0),
      b: {
        aa: [vec3h(1.0, 2.0, 3.0), vec3h(4.0, 5.0, 6.0)],
        bb: 7.0,
      },
      c: vec2h(8.0, 9.0),
    };

    writeData(new BufferWriter(buffer2), TestStruct2, value2);
    expect(readData(new BufferReader(buffer2), TestStruct2)).toStrictEqual(
      value2,
    );
  });

  it('can be called to create an object', () => {
    const TestStruct = struct({
      x: u32,
      y: vec3u,
    });

    const obj = TestStruct({ x: 1, y: vec3u(1, 2, 3) });

    expect(obj).toStrictEqual({ x: 1, y: vec3u(1, 2, 3) });
    expectTypeOf(obj).toEqualTypeOf<{ x: number; y: v3u }>();
  });

  it('cannot be called with invalid properties', () => {
    const TestStruct = struct({
      x: u32,
      y: vec3u,
    });

    // @ts-expect-error
    TestStruct({ x: 1, z: 2 });
  });

  it('can be called to create a deep copy of other struct', () => {
    const schema = struct({ nested: struct({ prop1: vec2f, prop2: u32 }) });
    const instance = schema({ nested: { prop1: vec2f(1, 2), prop2: 21 } });

    const clone = schema(instance);

    expect(clone).toStrictEqual(instance);
    expect(clone).not.toBe(instance);
    expect(clone.nested).not.toBe(instance.nested);
    expect(clone.nested.prop1).not.toBe(instance.nested.prop1);
  });

  it('can be called to strip extra properties of a struct', () => {
    const schema = struct({ prop1: vec2f, prop2: u32 });
    const instance = { prop1: vec2f(1, 2), prop2: 21, prop3: 'extra' };

    const clone = schema(instance);

    expect(clone).toStrictEqual({ prop1: vec2f(1, 2), prop2: 21 });
  });
});
