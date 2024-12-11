import { BufferReader, BufferWriter } from 'typed-binary';
import { describe, expect } from 'vitest';
import {
  type Infer,
  align,
  looseArrayOf,
  size,
  sizeOf,
  vec3f,
  vec3u,
} from '../src/data';
import { readData, writeData } from '../src/data/dataIO';
import { it } from './utils/myIt';

describe('loose', () => {
  it('does not take element alignment into account when measuring', () => {
    const TestArray = looseArrayOf(vec3u, 3);
    expect(sizeOf(TestArray)).toEqual(36);
  });

  it('takes element alignment into account when measuring with custom aligned elements', () => {
    const TestArray = looseArrayOf(align(16, vec3u), 3);
    expect(sizeOf(TestArray)).toEqual(48);
  });

  it('properly handles calculating nested loose array size', () => {
    const TestArray = looseArrayOf(looseArrayOf(vec3u, 3), 3);
    expect(sizeOf(TestArray)).toEqual(108);
  });

  it('does not align array elements when writing', () => {
    const TestArray = looseArrayOf(vec3u, 3);
    const buffer = new ArrayBuffer(sizeOf(TestArray));
    const writer = new BufferWriter(buffer);

    writeData(writer, TestArray, [
      vec3u(1, 2, 3),
      vec3u(4, 5, 6),
      vec3u(7, 8, 9),
    ]);
    expect([...new Uint32Array(buffer)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('aligns array elements when writing with custom aligned elements', () => {
    const TestArray = looseArrayOf(align(16, vec3u), 3);
    const buffer = new ArrayBuffer(sizeOf(TestArray));
    const writer = new BufferWriter(buffer);

    writeData(writer, TestArray, [
      vec3u(1, 2, 3),
      vec3u(4, 5, 6),
      vec3u(7, 8, 9),
    ]);
    expect([...new Uint32Array(buffer)]).toEqual([
      1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0,
    ]);
  });

  it('does not align array elements when reading', () => {
    const TestArray = looseArrayOf(vec3u, 3);
    const buffer = new ArrayBuffer(sizeOf(TestArray));
    const reader = new BufferReader(buffer);

    new Uint32Array(buffer).set([1, 2, 3, 0, 4, 5, 6, 0, 7]);

    expect(readData(reader, TestArray)).toEqual([
      vec3u(1, 2, 3),
      vec3u(0, 4, 5),
      vec3u(6, 0, 7),
    ]);
  });

  it('aligns array elements when reading with custom aligned elements', () => {
    const TestArray = looseArrayOf(align(16, vec3u), 3);
    const buffer = new ArrayBuffer(sizeOf(TestArray));
    const reader = new BufferReader(buffer);

    new Uint32Array(buffer).set([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);

    expect(readData(reader, TestArray)).toEqual([
      vec3u(1, 2, 3),
      vec3u(4, 5, 6),
      vec3u(7, 8, 9),
    ]);
  });

  it('aligns array elements when reading with custom aligned elements and other attributes', () => {
    const TestArray = looseArrayOf(size(12, align(16, vec3u)), 3);
    const buffer = new ArrayBuffer(sizeOf(TestArray));
    const reader = new BufferReader(buffer);

    new Uint32Array(buffer).set([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);

    expect(readData(reader, TestArray)).toEqual([
      vec3u(1, 2, 3),
      vec3u(4, 5, 6),
      vec3u(7, 8, 9),
    ]);
  });

  it('encodes and decodes arrays properly', () => {
    const TestArray = looseArrayOf(vec3f, 5);

    const buffer = new ArrayBuffer(sizeOf(TestArray));

    const value: Infer<typeof TestArray> = [
      vec3f(1.5, 2, 3.5),
      vec3f(),
      vec3f(-1.5, 2, 3.5),
      vec3f(1.5, -2, 3.5),
      vec3f(1.5, 2, 15),
    ];

    writeData(new BufferWriter(buffer), TestArray, value);
    expect(readData(new BufferReader(buffer), TestArray)).toEqual(value);
  });
});
