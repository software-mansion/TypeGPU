import { describe, expect } from 'vitest';
import * as d from '../src/data/index.ts';
import { offsetsForProps } from '../src/data/offsets.ts';
import { getWriteInstructions, type WriteInstruction } from '../src/data/partialIO.ts';
import type { TypedArray } from '../src/shared/utilityTypes.ts';
import { it } from './utils/extendedIt.ts';

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
  expect(instruction.data.byteOffset).toBe(start);
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

describe('getWriteInstructions', () => {
  it('should return correct write instructions for simple data', () => {
    const instructions = getWriteInstructions(d.u32, 3) as [WriteInstruction];

    expect(instructions).toHaveLength(1);

    expectInstruction(instructions[0], {
      start: 0,
      length: 4,
      expectedData: new Uint32Array([3]),
    });
  });

  it('should return correct write instructions for props', () => {
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

    const instructions = getWriteInstructions(struct, data) as [WriteInstruction];
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

  it('should return correct write instructions for props with arrays', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.arrayOf(d.vec3f, 4),
      c: d.struct({ d: d.u32 }),
    });

    const data = {
      a: 3,
      c: { d: 4 },
      b: [
        { idx: 1, value: d.vec3f(4, 5, 6) },
        { idx: 0, value: d.vec3f(1, 2, 3) },
        { idx: 3, value: d.vec3f(10, 11, 12) },
        { idx: 2, value: d.vec3f(7, 8, 9) },
      ],
    };

    const instructions = getWriteInstructions(struct, data) as [WriteInstruction];
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

  it('should return correct write instructions for props with arrays and missing data', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.arrayOf(d.vec3f, 4),
      c: d.struct({ d: d.u32 }),
    });

    const data = {
      b: [
        { idx: 2, value: d.vec3f(7, 8, 9) },
        { idx: 0, value: d.vec3f(1, 2, 3) },
        { idx: 3, value: d.vec3f(10, 11, 12) },
      ],
      c: { d: 4 },
    };

    const instructions = getWriteInstructions(struct, data) as [WriteInstruction, WriteInstruction];
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

  it('should return correct write instructions for arrays of structs', () => {
    const Boid = d.struct({
      position: d.vec3f,
      velocity: d.vec3f,
    });

    const struct = d.struct({
      boids: d.arrayOf(Boid, 3),
    });

    const data = [
      {
        idx: 1,
        value: { position: d.vec3f(1, 2, 3) },
      },
    ];

    const instructions = getWriteInstructions(struct, {
      boids: data,
    }) as [WriteInstruction];

    expect(instructions).toHaveLength(1);

    expectInstruction(instructions[0], {
      start: 32,
      length: 12,
      expectedData: [new Float32Array([1, 2, 3])],
    });
  });

  it('should not accept invalid data', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.vec3f,
      c: d.struct({ d: d.u32 }),
    });

    // @ts-expect-error
    getWriteInstructions(struct, { a: 3, b: 4, c: 5 });
  });

  it('should not merge instructions if there is a gap', () => {
    const array = d.arrayOf(d.vec3f, 1024);

    const data = Array.from({ length: 1024 })
      .map((_, i) => i)
      .filter((i) => i % 2 === 0)
      .map((i) => ({ idx: i, value: d.vec3f(1, 2, 3) }));

    const instructions = getWriteInstructions(array, data);

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
});
