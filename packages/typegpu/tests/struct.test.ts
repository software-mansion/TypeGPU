import { BufferReader, BufferWriter, type Parsed } from 'typed-binary';
import { describe, expect, it } from 'vitest';
import { f32, i32, struct, u32, vec2u, vec3f, vec3u } from '../src/data';

describe('struct', () => {
  it('aligns struct properties when measuring', () => {
    const S = struct({
      x: u32,
      y: vec3u,
    });
    expect(S.size).toEqual(32);
  });

  it('aligns struct properties when writing', () => {
    const buffer = new ArrayBuffer(32);
    const writer = new BufferWriter(buffer);

    const S = struct({
      x: u32,
      y: vec3u,
    });

    S.write(writer, { x: 1, y: vec3u(1, 2, 3) });
    expect([...new Uint32Array(buffer)]).toEqual([1, 0, 0, 0, 1, 2, 3, 0]);
    expect(writer.currentByteOffset).toEqual(28);
  });

  it('aligns struct properties when reading', () => {
    const buffer = new ArrayBuffer(32);
    const reader = new BufferReader(buffer);

    new Uint32Array(buffer).set([3, 0, 0, 0, 4, 5, 6]);

    const S = struct({
      x: u32,
      y: vec3u,
    });

    const x = S.read(reader);
    expect(x).toEqual({ x: 3, y: vec3u(4, 5, 6) });
    expect(reader.currentByteOffset).toEqual(28);
  });

  it('encodes and decodes structures properly', () => {
    const S = struct({
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

    const buffer = new ArrayBuffer(S.size);

    const value: Parsed<typeof S> = {
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

    S.write(new BufferWriter(buffer), value);
    expect(S.read(new BufferReader(buffer))).toEqual(value);
  });
});
