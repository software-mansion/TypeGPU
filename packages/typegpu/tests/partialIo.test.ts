import { describe, expect } from 'vitest';
import * as d from '../src/data';
import { offsetsForProps } from '../src/data/offests';
import {
  type WriteInstruction,
  getWriteInstructions,
} from '../src/data/partialIO';
import type { NTuple, TypedArray } from '../src/shared/utilityTypes';
import { it } from './utils/extendedIt';

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

  const dataArrays = Array.isArray(expectedData)
    ? expectedData
    : [expectedData];

  let totalByteLength = 0;
  for (const arr of dataArrays) {
    totalByteLength += arr.byteLength;
  }

  const mergedExpected = new Uint8Array(totalByteLength);
  let offset = 0;
  for (const arr of dataArrays) {
    mergedExpected.set(
      new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength),
      offset,
    );
    offset += arr.byteLength;
  }

  expect(instruction.data).toHaveLength(totalByteLength);
  expect(instruction.data).toEqual(mergedExpected);
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
      c: { offset: 28, size: 4 },
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
      c: { offset: 80, size: 4 },
    });
  });
});

describe('getWriteInstructions', () => {
  it('should return correct write instructions for props', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.vec3f,
      c: d.struct({ d: d.u32 }),
    });

    const data = {
      a: 3,
      b: d.vec3f(1, 2, 3),
      c: { d: 4 },
    };

    const instructions = getWriteInstructions(struct, data) as [
      WriteInstruction,
    ];
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
      b: [
        { idx: 0, value: d.vec3f(1, 2, 3) },
        { idx: 1, value: d.vec3f(4, 5, 6) },
        { idx: 2, value: d.vec3f(7, 8, 9) },
        { idx: 3, value: d.vec3f(10, 11, 12) },
      ],
      c: { d: 4 },
    };

    const instructions = getWriteInstructions(struct, data) as NTuple<
      WriteInstruction,
      1
    >;
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
        { idx: 0, value: d.vec3f(1, 2, 3) },
        { idx: 2, value: d.vec3f(7, 8, 9) },
        { idx: 3, value: d.vec3f(10, 11, 12) },
      ],
      c: { d: 4 },
    };

    const instructions = getWriteInstructions(struct, data) as NTuple<
      WriteInstruction,
      2
    >;
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
});
