import {
  BufferReader,
  BufferWriter,
  MaxValue,
  type Parsed,
} from 'typed-binary';
import { describe, expect, it } from 'vitest';
import {
  arrayOf,
  f32,
  i32,
  struct,
  u32,
  vec2u,
  vec3f,
  vec3u,
} from '../src/data';

describe('struct', () => {
  it('aligns struct properties when measuring', () => {
    const TestStruct = struct({
      x: u32,
      y: vec3u,
    });
    expect(TestStruct.size).toEqual(32);
    expect(TestStruct.measure(MaxValue).size).toEqual(32);
  });

  it('aligns struct properties when writing', () => {
    const TestStruct = struct({
      x: u32,
      y: vec3u,
    });

    const buffer = new ArrayBuffer(TestStruct.size);
    const writer = new BufferWriter(buffer);

    TestStruct.write(writer, { x: 1, y: vec3u(1, 2, 3) });
    expect([...new Uint32Array(buffer)]).toEqual([1, 0, 0, 0, 1, 2, 3, 0]);
  });

  it('aligns struct properties when reading', () => {
    const TestStruct = struct({
      x: u32,
      y: vec3u,
    });

    const buffer = new ArrayBuffer(TestStruct.size);
    const reader = new BufferReader(buffer);

    new Uint32Array(buffer).set([3, 0, 0, 0, 4, 5, 6]);

    expect(TestStruct.read(reader)).toEqual({ x: 3, y: vec3u(4, 5, 6) });
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

    const buffer = new ArrayBuffer(TestStruct.size);

    const value: Parsed<typeof TestStruct> = {
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

    TestStruct.write(new BufferWriter(buffer), value);
    expect(TestStruct.read(new BufferReader(buffer))).toEqual(value);
  });

  it('allows for runtime sized arrays as last property', () => {
    const Unbounded = struct({
      a: u32,
      b: vec3u,
      c: arrayOf(u32, 0),
    });

    expect(Unbounded.measure(MaxValue).size).toBeNaN();
    expect(() => Unbounded.size).toThrow();

    expect(() => {
      const Invalid = struct({
        a: u32,
        b: arrayOf(u32, 0),
        c: vec3u,
      });
    }).toThrow();

    expect(() => {
      const Invalid = struct({
        a: u32,
        b: Unbounded,
      });
    }).toThrow();
  });
});
