import { BufferReader, BufferWriter } from 'typed-binary';
import { describe, expect, it } from 'vitest';
import { arrayOf, sizeOf, vec3f, vec3u } from '../src/data';
import { readData, writeData } from '../src/data/dataIO';
import { StrictNameRegistry } from '../src/nameRegistry';
import { resolve } from '../src/resolutionCtx';
import type { Infer } from '../src/shared/repr';

describe('array', () => {
  it('takes element alignment into account when measuring', () => {
    const TestArray = arrayOf(vec3u, 3);
    expect(sizeOf(TestArray)).toEqual(48);
  });

  it('aligns array elements when writing', () => {
    const TestArray = arrayOf(vec3u, 3);
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

  it('aligns array elements when reading', () => {
    const TestArray = arrayOf(vec3u, 3);
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
    const TestArray = arrayOf(vec3f, 5);

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

  it('throws when trying to read/write a runtime-sized array', () => {
    const TestArray = arrayOf(vec3f, 0);

    expect(sizeOf(TestArray)).toBeNaN();

    expect(() =>
      writeData(new BufferWriter(new ArrayBuffer(0)), TestArray, [
        vec3f(),
        vec3f(),
      ]),
    ).toThrow();

    expect(() =>
      readData(new BufferReader(new ArrayBuffer(0)), TestArray),
    ).toThrow();

    const opts = { names: new StrictNameRegistry() };

    expect(resolve(TestArray, opts).code).toContain('array<vec3f>');
  });

  it('throws when trying to nest runtime sized arrays', () => {
    expect(() => arrayOf(arrayOf(vec3f, 0), 0)).toThrow();
  });
});
