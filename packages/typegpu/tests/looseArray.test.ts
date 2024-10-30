import { BufferReader, BufferWriter, type Parsed } from 'typed-binary';
import { describe, expect, it, vi } from 'vitest';
import {
  align,
  float16x2,
  size,
  snorm8x2,
  vec2f,
  vec3f,
  vec3u,
} from '../src/data';
import { looseArrayOf } from '../src/data/array';
import { tgpu } from '../src/experimental';

const mockDevice = {
  createBuffer: vi.fn(() => 'mockBuffer'),
  queue: {},
} as unknown as GPUDevice;

global.GPUBufferUsage = {
  MAP_READ: 1,
  MAP_WRITE: 2,
  COPY_SRC: 4,
  COPY_DST: 8,
  INDEX: 16,
  VERTEX: 32,
  UNIFORM: 64,
  STORAGE: 128,
  INDIRECT: 256,
  QUERY_RESOLVE: 512,
};

describe('loose', () => {
  it('does not take element alignment into account when measuring', () => {
    const TestArray = looseArrayOf(vec3u, 3);
    expect(TestArray.size).toEqual(36);
  });

  it('takes element alignment into account when measuring with custom aligned elements', () => {
    const TestArray = looseArrayOf(align(16, vec3u), 3);
    expect(TestArray.size).toEqual(48);
  });

  it('properly handles calculating nested loose array size', () => {
    const TestArray = looseArrayOf(looseArrayOf(vec3u, 3), 3);
    expect(TestArray.size).toEqual(108);
  });

  it('does not align array elements when writing', () => {
    const TestArray = looseArrayOf(vec3u, 3);
    const buffer = new ArrayBuffer(TestArray.size);
    const writer = new BufferWriter(buffer);

    TestArray.write(writer, [vec3u(1, 2, 3), vec3u(4, 5, 6), vec3u(7, 8, 9)]);
    expect([...new Uint32Array(buffer)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('aligns array elements when writing with custom aligned elements', () => {
    const TestArray = looseArrayOf(align(16, vec3u), 3);
    const buffer = new ArrayBuffer(TestArray.size);
    const writer = new BufferWriter(buffer);

    TestArray.write(writer, [vec3u(1, 2, 3), vec3u(4, 5, 6), vec3u(7, 8, 9)]);
    expect([...new Uint32Array(buffer)]).toEqual([
      1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0,
    ]);
  });

  it('does not align array elements when reading', () => {
    const TestArray = looseArrayOf(vec3u, 3);
    const buffer = new ArrayBuffer(TestArray.size);
    const reader = new BufferReader(buffer);

    new Uint32Array(buffer).set([1, 2, 3, 0, 4, 5, 6, 0, 7]);

    expect(TestArray.read(reader)).toEqual([
      vec3u(1, 2, 3),
      vec3u(0, 4, 5),
      vec3u(6, 0, 7),
    ]);
  });

  it('aligns array elements when reading with custom aligned elements', () => {
    const TestArray = looseArrayOf(align(16, vec3u), 3);
    const buffer = new ArrayBuffer(TestArray.size);
    const reader = new BufferReader(buffer);

    new Uint32Array(buffer).set([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);

    expect(TestArray.read(reader)).toEqual([
      vec3u(1, 2, 3),
      vec3u(4, 5, 6),
      vec3u(7, 8, 9),
    ]);
  });

  it('aligns array elements when reading with custom aligned elements and other attributes', () => {
    const TestArray = looseArrayOf(size(12, align(16, vec3u)), 3);
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
    const TestArray = looseArrayOf(vec3f, 5);

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

  it('encodes and decodes float16 arrays properly', () => {
    const TestArray = looseArrayOf(float16x2, 5);

    expect(TestArray.size).toEqual(20);
    const buffer = new ArrayBuffer(TestArray.size);

    const value: Parsed<typeof TestArray> = [
      vec2f(1.5, 2),
      vec2f(),
      vec2f(-1.5, 2),
      vec2f(1.5, -2),
      vec2f(1.5, 15),
    ];

    TestArray.write(new BufferWriter(buffer), value);
    expect(TestArray.read(new BufferReader(buffer))).toEqual(value);
  });

  it('encodes and decodes arrays of normalized floats properly', () => {
    const TestArray = looseArrayOf(snorm8x2, 5);

    expect(TestArray.size).toEqual(10);

    const buffer = new ArrayBuffer(TestArray.size);

    const value: Parsed<typeof TestArray> = [
      vec2f(0.5, 0.25),
      vec2f(),
      vec2f(-0.5, 0.25),
      vec2f(0.5, -0.25),
      vec2f(0.5, 1),
    ];

    TestArray.write(new BufferWriter(buffer), value);
    for (const val of TestArray.read(new BufferReader(buffer))) {
      const expected = value.shift();
      if (!expected) {
        throw new Error('Expected value not found');
      }
      expect(expected.x).toBeCloseTo(val.x, 1);
      expect(expected.y).toBeCloseTo(val.y, 1);
    }
  });

  it('is not assignable to regular buffers', () => {
    const TestArray = looseArrayOf(vec3f, 5);
    const root = tgpu.initFromDevice({
      device: mockDevice,
    });

    // @ts-expect-error
    root.createBuffer(TestArray);
  });
});
