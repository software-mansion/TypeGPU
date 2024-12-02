import { BufferReader, BufferWriter } from 'typed-binary';
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
import { readData, writeData } from '../src/data/dataIO';
import { sizeOf } from '../src/data/sizeOf';
import type { Infer } from '../src/shared/repr';

describe('struct', () => {
  it('aligns struct properties when measuring', () => {
    const TestStruct = struct({
      x: u32,
      y: vec3u,
    });
    expect(sizeOf(TestStruct)).toEqual(32);
  });

  it('aligns struct properties when writing', () => {
    const TestStruct = struct({
      x: u32,
      y: vec3u,
    });

    const buffer = new ArrayBuffer(sizeOf(TestStruct));
    const writer = new BufferWriter(buffer);

    writeData(writer, TestStruct, { x: 1, y: vec3u(1, 2, 3) });
    expect([...new Uint32Array(buffer)]).toEqual([1, 0, 0, 0, 1, 2, 3, 0]);
  });

  it('aligns struct properties when reading', () => {
    const TestStruct = struct({
      x: u32,
      y: vec3u,
    });

    const buffer = new ArrayBuffer(sizeOf(TestStruct));
    const reader = new BufferReader(buffer);

    new Uint32Array(buffer).set([3, 0, 0, 0, 4, 5, 6]);

    expect(readData(reader, TestStruct)).toEqual({ x: 3, y: vec3u(4, 5, 6) });
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
    expect(readData(new BufferReader(buffer), TestStruct)).toEqual(value);
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
});
