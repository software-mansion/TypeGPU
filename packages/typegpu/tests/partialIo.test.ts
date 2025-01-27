import { describe, expect } from 'vitest';
import * as d from '../src/data';
import { offsetsForProps } from '../src/data/offests';
import {
  type WriteInstruction,
  getWriteInstructions,
} from '../src/data/partialIO';
import type { NTuple } from '../src/shared/utilityTypes';
import { it } from './utils/extendedIt';

type TestTypedArray =
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Int32Array
  | Float32Array
  | Float64Array;

type ExpectedData = TestTypedArray | TestTypedArray[];

function expectInstruction(
  instruction: WriteInstruction,
  {
    start,
    length,
    expectedData,
  }: {
    start: number;
    length: number;
    expectedData: ExpectedData;
  },
): void {
  expect(instruction.start).toBe(start);
  expect(instruction.length).toBe(length);

  const actualBytes =
    instruction.data instanceof Uint8Array
      ? instruction.data
      : new Uint8Array(instruction.data);

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

  expect(actualBytes).toHaveLength(totalByteLength);
  expect(actualBytes).toEqual(mergedExpected);
}

describe('offsetsForProps', () => {
  it('should return correct offsets for props', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.vec3f,
      c: d.struct({ d: d.u32 }),
    });

    const offsets = offsetsForProps(struct);
    expect(offsets).toStrictEqual({ a: 0, b: 16, c: 28 });
  });

  it('should return correct offsets for props with arrays', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.arrayOf(d.vec3f, 4),
      c: d.struct({ d: d.u32 }),
    });

    const offsets = offsetsForProps(struct);
    expect(offsets).toStrictEqual({ a: 0, b: 16, c: 80 });
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

    const instructions = getWriteInstructions(struct, data) as NTuple<
      WriteInstruction,
      2
    >;
    expect(instructions).toHaveLength(2);

    expectInstruction(instructions[0], {
      start: 0,
      length: 4,
      expectedData: new Uint32Array([3]),
    });

    expectInstruction(instructions[1], {
      start: 16,
      length: 16,
      expectedData: [new Float32Array([1, 2, 3]), new Uint32Array([4])],
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
      b: {
        0: d.vec3f(1, 2, 3),
        1: d.vec3f(4, 5, 6),
        2: d.vec3f(7, 8, 9),
        3: d.vec3f(10, 11, 12),
      },
      c: { d: 4 },
    };

    const instructions = getWriteInstructions(struct, data) as NTuple<
      WriteInstruction,
      6
    >;
    expect(instructions).toHaveLength(6);

    expectInstruction(instructions[0], {
      start: 0,
      length: 4,
      expectedData: new Uint32Array([3]),
    });
    expectInstruction(instructions[1], {
      start: 16,
      length: 12,
      expectedData: new Float32Array([1, 2, 3]),
    });
    expectInstruction(instructions[2], {
      start: 32,
      length: 12,
      expectedData: new Float32Array([4, 5, 6]),
    });
    expectInstruction(instructions[3], {
      start: 48,
      length: 12,
      expectedData: new Float32Array([7, 8, 9]),
    });
    expectInstruction(instructions[4], {
      start: 64,
      length: 12,
      expectedData: new Float32Array([10, 11, 12]),
    });
    expectInstruction(instructions[5], {
      start: 80,
      length: 4,
      expectedData: new Uint32Array([4]),
    });
  });

  it('should return correct write instructions for props with arrays and missing data', () => {
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

    const instructions = getWriteInstructions(struct, data) as NTuple<
      WriteInstruction,
      4
    >;
    expect(instructions).toHaveLength(4);

    expectInstruction(instructions[0], {
      start: 16,
      length: 12,
      expectedData: new Float32Array([1, 2, 3]),
    });
    expectInstruction(instructions[1], {
      start: 48,
      length: 12,
      expectedData: new Float32Array([7, 8, 9]),
    });
    expectInstruction(instructions[2], {
      start: 64,
      length: 12,
      expectedData: new Float32Array([10, 11, 12]),
    });
    expectInstruction(instructions[3], {
      start: 80,
      length: 4,
      expectedData: new Uint32Array([4]),
    });
  });
});
