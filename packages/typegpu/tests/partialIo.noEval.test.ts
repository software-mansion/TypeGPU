/**
 * Tests for getPatchInstructions when the compiled writer is unavailable
 * (CSP/eval-restricted environments). vi.mock is hoisted by vitest so this
 * file's entire module graph sees getCompiledWriter returning undefined,
 * forcing the typed-binary fallback path in partialIO.ts.
 */
import { describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import type { TypedArray } from '../src/shared/utilityTypes.ts';
import type { WriteInstruction } from '../src/data/partialIO.ts';

vi.mock('../src/data/compiledIO.ts', () => ({
  EVAL_ALLOWED_IN_ENV: false,
  getCompiledWriter: () => undefined,
  buildWriter: () => '',
}));

// Dynamic imports are required AFTER vi.mock to get the mocked versions.
const { getPatchInstructions } = await import('../src/data/partialIO.ts');
const d = await import('../src/data/index.ts');

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
  expect(new Uint8Array(instruction.data)).toStrictEqual(mergedExpected);
}

describe('getPatchInstructions (no-eval / typed-binary fallback)', () => {
  it('should produce correct instructions for a scalar', () => {
    const instructions = getPatchInstructions(d.u32, 3) as [WriteInstruction];
    expect(instructions).toHaveLength(1);
    expectInstruction(instructions[0], {
      start: 0,
      length: 4,
      expectedData: new Uint32Array([3]),
    });
  });

  it('should produce correct instructions for a struct', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.vec3f,
      c: d.struct({ d: d.u32 }),
    });

    const instructions = getPatchInstructions(struct, {
      a: 3,
      b: d.vec3f(1, 2, 3),
      c: { d: 4 },
    }) as [WriteInstruction];

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

  it('should handle sparse array updates', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.arrayOf(d.vec3f, 4),
    });

    const instructions = getPatchInstructions(struct, {
      b: { 1: d.vec3f(4, 5, 6) },
    }) as [WriteInstruction];

    expect(instructions).toHaveLength(1);
    expectInstruction(instructions[0], {
      start: 32, // offset of b[1]: 16 (b start) + 1 * 16 (element stride)
      length: 12,
      expectedData: new Float32Array([4, 5, 6]),
    });
  });

  it('should split instructions at non-contiguous gaps', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.vec3f,
    });

    // Only patch b, leaving a out — creates a gap after start
    const instructions = getPatchInstructions(struct, { b: d.vec3f(1, 2, 3) }) as [
      WriteInstruction,
    ];

    expect(instructions).toHaveLength(1);
    expectInstruction(instructions[0], {
      start: 16,
      length: 12,
      expectedData: new Float32Array([1, 2, 3]),
    });
  });
});
