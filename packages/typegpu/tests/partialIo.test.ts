import { describe, expect } from 'vitest';
import * as d from '../src/data/index.ts';
import { offsetsForProps } from '../src/data/offsets.ts';
import {
  convertPartialToPatch,
  getPatchInstructions,
  type WriteInstruction,
} from '../src/data/partialIO.ts';
import type { TypedArray } from '../src/shared/utilityTypes.ts';
import { it } from 'typegpu-testing-utility';

function expectInstruction(
  instruction: WriteInstruction,
  {
    start,
    length,
    expectedData,
  }: {
    start: number;
    length: number;
    expectedData: TypedArray | TypedArray[];
  },
): void {
  expect(instruction.gpuOffset).toBe(start);
  expect(instruction.data.byteLength).toBe(length);

  const dataArrays = Array.isArray(expectedData) ? expectedData : [expectedData];

  const totalByteLength = dataArrays.reduce((acc, arr) => acc + arr.byteLength, 0);

  const mergedExpected = new Uint8Array(totalByteLength);
  let offset = 0;
  for (const arr of dataArrays) {
    mergedExpected.set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), offset);
    offset += arr.byteLength;
  }

  expect(instruction.data).toHaveLength(totalByteLength);
  expect(instruction.data).toStrictEqual(mergedExpected);
}

describe('offsetsForProps', () => {
  it('should return correct offsets for props', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.vec3f,
      c: d.struct({ d: d.u32 }),
    });

    const offsets = offsetsForProps(struct);
    expect(offsets).toStrictEqual({
      a: { offset: 0, size: 4, padding: 12 },
      b: { offset: 16, size: 12, padding: 0 },
      c: { offset: 28, size: 4, padding: 0 },
    });
  });

  it('should return correct offsets for props with arrays', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.arrayOf(d.vec3f, 4),
      c: d.struct({ d: d.u32 }),
    });

    const offsets = offsetsForProps(struct);
    expect(offsets).toStrictEqual({
      a: { offset: 0, size: 4, padding: 12 },
      b: { offset: 16, size: 64, padding: 0 },
      c: { offset: 80, size: 4, padding: 12 },
    });
  });

  it('should return correct offsets for deeply nested structs', () => {
    const One = d.struct({
      a: d.u32,
      b: d.vec3f,
    });

    const Two = d.struct({
      c: d.arrayOf(One, 3),
      d: d.vec4u,
    });

    const Three = d.struct({
      e: One,
      f: d.arrayOf(Two, 2),
    });

    const offsets = offsetsForProps(Three);

    expect(offsets).toStrictEqual({
      e: { offset: 0, size: 32, padding: 0 },
      f: { offset: 32, size: 224, padding: 0 },
    });

    const oneOffsets = offsetsForProps(One);

    expect(oneOffsets).toStrictEqual({
      a: { offset: 0, size: 4, padding: 12 },
      b: { offset: 16, size: 12, padding: 4 },
    });

    const twoOffsets = offsetsForProps(Two);

    expect(twoOffsets).toStrictEqual({
      c: { offset: 0, size: 96, padding: 0 },
      d: { offset: 96, size: 16, padding: 0 },
    });
  });
});

describe('convertPartialToPatch', () => {
  it('should convert sparse {idx, value}[] to Record<number, T>', () => {
    const schema = d.arrayOf(d.vec3f, 4);
    const partial = [
      { idx: 1, value: d.vec3f(1, 2, 3) },
      { idx: 3, value: d.vec3f(4, 5, 6) },
    ];

    const result = convertPartialToPatch(schema, partial) as Record<number, unknown>;
    expect(result[1]).toEqual(d.vec3f(1, 2, 3));
    expect(result[3]).toEqual(d.vec3f(4, 5, 6));
    expect(Object.keys(result)).toHaveLength(2);
  });

  it('should recurse into struct fields', () => {
    const schema = d.struct({
      a: d.u32,
      b: d.arrayOf(d.f32, 3),
    });
    const partial = {
      b: [
        { idx: 0, value: 1.0 },
        { idx: 2, value: 3.0 },
      ],
    };

    const result = convertPartialToPatch(schema, partial) as Record<string, unknown>;
    expect(result.b).toEqual({ 0: 1.0, 2: 3.0 });
  });

  it('should pass through leaves unchanged', () => {
    expect(convertPartialToPatch(d.u32, 42)).toBe(42);
    expect(convertPartialToPatch(d.f32, undefined)).toBeUndefined();
  });
});

describe('getPatchInstructions', () => {
  it('should return correct instructions for simple data', () => {
    const instructions = getPatchInstructions(d.u32, 3) as [WriteInstruction];

    expect(instructions).toHaveLength(1);

    expectInstruction(instructions[0], {
      start: 0,
      length: 4,
      expectedData: new Uint32Array([3]),
    });
  });

  it('should return correct instructions for struct fields', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.vec3f,
      c: d.struct({ d: d.u32 }),
    });

    const data = {
      b: d.vec3f(1, 2, 3),
      a: 3,
      c: { d: 4 },
    };

    const instructions = getPatchInstructions(struct, data) as [WriteInstruction];
    expect(instructions).toHaveLength(1);

    expectInstruction(instructions[0], {
      start: 0,
      length: 32,
      expectedData: [
        new Uint32Array([3, 0, 0, 0]),
        new Float32Array([1, 2, 3]),
        new Uint32Array([4]),
      ],
    });
  });

  it('should handle sparse array updates via Record<number, T>', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.arrayOf(d.vec3f, 4),
      c: d.struct({ d: d.u32 }),
    });

    const data = {
      a: 3,
      c: { d: 4 },
      b: {
        0: d.vec3f(1, 2, 3),
        1: d.vec3f(4, 5, 6),
        2: d.vec3f(7, 8, 9),
        3: d.vec3f(10, 11, 12),
      },
    };

    const instructions = getPatchInstructions(struct, data) as [WriteInstruction];
    expect(instructions).toHaveLength(1);

    expectInstruction(instructions[0], {
      start: 0,
      length: 84,
      expectedData: [
        new Uint32Array([3, 0, 0, 0]),
        new Float32Array([1, 2, 3, 0]),
        new Float32Array([4, 5, 6, 0]),
        new Float32Array([7, 8, 9, 0]),
        new Float32Array([10, 11, 12, 0]),
        new Uint32Array([4]),
      ],
    });
  });

  it('should split instructions when there is a gap', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.arrayOf(d.vec3f, 4),
      c: d.struct({ d: d.u32 }),
    });

    const data = {
      b: {
        0: d.vec3f(1, 2, 3),
        2: d.vec3f(7, 8, 9),
        3: d.vec3f(10, 11, 12),
      },
      c: { d: 4 },
    };

    const instructions = getPatchInstructions(struct, data) as [WriteInstruction, WriteInstruction];
    expect(instructions).toHaveLength(2);

    expectInstruction(instructions[0], {
      start: 16,
      length: 12,
      expectedData: [new Float32Array([1, 2, 3])],
    });

    expectInstruction(instructions[1], {
      start: 48,
      length: 36,
      expectedData: [
        new Float32Array([7, 8, 9, 0]),
        new Float32Array([10, 11, 12, 0]),
        new Uint32Array([4]),
      ],
    });
  });

  it('should handle arrays of structs with partial updates', () => {
    const Boid = d.struct({
      position: d.vec3f,
      velocity: d.vec3f,
    });

    const struct = d.struct({
      boids: d.arrayOf(Boid, 3),
    });

    const instructions = getPatchInstructions(struct, {
      boids: { 1: { position: d.vec3f(1, 2, 3) } },
    }) as [WriteInstruction];

    expect(instructions).toHaveLength(1);

    expectInstruction(instructions[0], {
      start: 32,
      length: 12,
      expectedData: [new Float32Array([1, 2, 3])],
    });
  });

  it('should handle dense array replacement', () => {
    const array = d.arrayOf(d.u32, 3);

    const instructions = getPatchInstructions(array, [100, 200, 300]) as [WriteInstruction];

    expect(instructions).toHaveLength(1);

    expectInstruction(instructions[0], {
      start: 0,
      length: 12,
      expectedData: new Uint32Array([100, 200, 300]),
    });
  });

  it('should not false-positive on struct elements with idx/value fields', () => {
    const WeirdSchema = d.struct({ idx: d.u32, value: d.f32 });
    const array = d.arrayOf(WeirdSchema, 4);

    const instructions = getPatchInstructions(array, {
      1: { idx: 42, value: 3.14 },
    }) as [WriteInstruction];

    expect(instructions).toHaveLength(1);

    expectInstruction(instructions[0], {
      start: 8,
      length: 8,
      expectedData: [new Uint32Array([42]), new Float32Array([3.14])],
    });
  });

  it('should not merge instructions for non-contiguous sparse elements', () => {
    const array = d.arrayOf(d.vec3f, 1024);

    const data: Record<number, unknown> = {};
    for (let i = 0; i < 1024; i += 2) {
      data[i] = d.vec3f(1, 2, 3);
    }

    const instructions = getPatchInstructions(array, data);

    expect(instructions).toHaveLength(512);

    for (let i = 0; i < 512; i++) {
      if (instructions[i] === undefined) {
        throw new Error('Instruction is undefined');
      }
      expectInstruction(instructions[i] as WriteInstruction, {
        start: i * 2 * 16,
        length: 12,
        expectedData: new Float32Array([1, 2, 3]),
      });
    }
  });

  it('should handle invalid data gracefully', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.vec3f,
      c: d.struct({ d: d.u32 }),
    });

    // getPatchInstructions accepts unknown, so invalid shapes just produce leaf writes
    const instructions = getPatchInstructions(struct, { a: 3, b: 4, c: 5 });
    expect(instructions.length).toBeGreaterThan(0);
  });
});
