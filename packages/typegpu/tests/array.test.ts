import { BufferReader, BufferWriter, type Parsed } from 'typed-binary';
import { describe, expect, it } from 'vitest';
import { arrayOf, vec3f, vec3u } from '../src/data';

describe('array', () => {
  it('takes element alignment into account when measuring', () => {
    const TestArray = arrayOf(vec3u, 3);
    expect(TestArray.size).toEqual(48);
  });

  it('aligns array elements when writing', () => {
    const TestArray = arrayOf(vec3u, 3);
    const buffer = new ArrayBuffer(TestArray.size);
    const writer = new BufferWriter(buffer);

    TestArray.write(writer, [vec3u(1, 2, 3), vec3u(4, 5, 6), vec3u(7, 8, 9)]);
    expect([...new Uint32Array(buffer)]).toEqual([
      1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0,
    ]);
  });

  it('aligns array elements when reading', () => {
    const TestArray = arrayOf(vec3u, 3);
    const buffer = new ArrayBuffer(TestArray.size);
    const reader = new BufferReader(buffer);

    new Uint32Array(buffer).set([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);

    expect(TestArray.read(reader)).toEqual([
      vec3u(1, 2, 3),
      vec3u(4, 5, 6),
      vec3u(7, 8, 9),
    ]);
  });

  it('encodes and decodes arrays properly', () => {
    const TestArray = arrayOf(vec3f, 5);

    const buffer = new ArrayBuffer(TestArray.size);

    const value: Parsed<typeof TestArray> = [
      vec3f(1.5, 2, 3.5),
      vec3f(),
      vec3f(-1.5, 2, 3.5),
      vec3f(1.5, -2, 3.5),
      vec3f(1.5, 2, 15),
    ];

    TestArray.write(new BufferWriter(buffer), value);
    expect(TestArray.read(new BufferReader(buffer))).toEqual(value);
  });
});
