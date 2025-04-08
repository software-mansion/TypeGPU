import { BufferReader, BufferWriter } from 'typed-binary';
import { describe, expect } from 'vitest';
import * as d from '../src/data/index.ts';
import { readData, writeData } from '../src/data/dataIO.ts';
import { it } from './utils/extendedIt.ts';

describe('disarray', () => {
  it('does not take element alignment into account when measuring', () => {
    const TestArray = d.disarrayOf(d.vec3u, 3);
    expect(d.sizeOf(TestArray)).toEqual(36);
  });

  it('takes element alignment into account when measuring with custom aligned elements', () => {
    const TestArray = d.disarrayOf(d.align(16, d.vec3u), 3);
    expect(d.sizeOf(TestArray)).toEqual(48);
  });

  it('properly handles calculating nested loose array size', () => {
    const TestArray = d.disarrayOf(d.disarrayOf(d.vec3u, 3), 3);
    expect(d.sizeOf(TestArray)).toEqual(108);
  });

  it('does not align array elements when writing', () => {
    const TestArray = d.disarrayOf(d.vec3u, 3);
    const buffer = new ArrayBuffer(d.sizeOf(TestArray));
    const writer = new BufferWriter(buffer);

    writeData(writer, TestArray, [
      d.vec3u(1, 2, 3),
      d.vec3u(4, 5, 6),
      d.vec3u(7, 8, 9),
    ]);
    expect([...new Uint32Array(buffer)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('aligns array elements when writing with custom aligned elements', () => {
    const TestArray = d.disarrayOf(d.align(16, d.vec3u), 3);
    const buffer = new ArrayBuffer(d.sizeOf(TestArray));
    const writer = new BufferWriter(buffer);

    writeData(writer, TestArray, [
      d.vec3u(1, 2, 3),
      d.vec3u(4, 5, 6),
      d.vec3u(7, 8, 9),
    ]);
    expect([...new Uint32Array(buffer)]).toEqual([
      1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0,
    ]);
  });

  it('does not align array elements when reading', () => {
    const TestArray = d.disarrayOf(d.vec3u, 3);
    const buffer = new ArrayBuffer(d.sizeOf(TestArray));
    const reader = new BufferReader(buffer);

    new Uint32Array(buffer).set([1, 2, 3, 0, 4, 5, 6, 0, 7]);

    expect(readData(reader, TestArray)).toEqual([
      d.vec3u(1, 2, 3),
      d.vec3u(0, 4, 5),
      d.vec3u(6, 0, 7),
    ]);
  });

  it('aligns array elements when reading with custom aligned elements', () => {
    const TestArray = d.disarrayOf(d.align(16, d.vec3u), 3);
    const buffer = new ArrayBuffer(d.sizeOf(TestArray));
    const reader = new BufferReader(buffer);

    new Uint32Array(buffer).set([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);

    expect(readData(reader, TestArray)).toEqual([
      d.vec3u(1, 2, 3),
      d.vec3u(4, 5, 6),
      d.vec3u(7, 8, 9),
    ]);
  });

  it('aligns array elements when reading with custom aligned elements and other attributes', () => {
    const TestArray = d.disarrayOf(d.size(12, d.align(16, d.vec3u)), 3);
    const buffer = new ArrayBuffer(d.sizeOf(TestArray));
    const reader = new BufferReader(buffer);

    new Uint32Array(buffer).set([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);

    expect(readData(reader, TestArray)).toEqual([
      d.vec3u(1, 2, 3),
      d.vec3u(4, 5, 6),
      d.vec3u(7, 8, 9),
    ]);
  });

  it('encodes and decodes arrays properly', () => {
    const TestArray = d.disarrayOf(d.vec3f, 5);

    const buffer = new ArrayBuffer(d.sizeOf(TestArray));

    const value: d.Infer<typeof TestArray> = [
      d.vec3f(1.5, 2, 3.5),
      d.vec3f(),
      d.vec3f(-1.5, 2, 3.5),
      d.vec3f(1.5, -2, 3.5),
      d.vec3f(1.5, 2, 15),
    ];

    writeData(new BufferWriter(buffer), TestArray, value);
    expect(readData(new BufferReader(buffer), TestArray)).toEqual(value);
  });
});
