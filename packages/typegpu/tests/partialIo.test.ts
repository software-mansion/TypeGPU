import { describe, expect } from 'vitest';
import * as d from '../src/data';
import { offsetsForProps } from '../src/data/offests';
import {
  type WriteInstruction,
  combineContiguousInstructions,
  getWriteInstructions,
} from '../src/data/partialIO';
import { it } from './utils/extendedIt';

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

    const instructions = getWriteInstructions(struct, data);

    expect(instructions).toStrictEqual([
      { start: 0, length: 4, data: new Uint32Array([3]).buffer },
      { start: 16, length: 12, data: new Float32Array([1, 2, 3]).buffer },
      { start: 28, length: 4, data: new Uint32Array([4]).buffer },
    ]);
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

    const instructions = getWriteInstructions(struct, data);

    expect(instructions).toStrictEqual([
      { start: 0, length: 4, data: new Uint32Array([3]).buffer },
      { start: 16, length: 12, data: new Float32Array([1, 2, 3]).buffer },
      { start: 32, length: 12, data: new Float32Array([4, 5, 6]).buffer },
      { start: 48, length: 12, data: new Float32Array([7, 8, 9]).buffer },
      { start: 64, length: 12, data: new Float32Array([10, 11, 12]).buffer },
      { start: 80, length: 4, data: new Uint32Array([4]).buffer },
    ]);
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

    const instructions = getWriteInstructions(struct, data);

    expect(instructions).toStrictEqual([
      { start: 16, length: 12, data: new Float32Array([1, 2, 3]).buffer },
      { start: 48, length: 12, data: new Float32Array([7, 8, 9]).buffer },
      { start: 64, length: 12, data: new Float32Array([10, 11, 12]).buffer },
      { start: 80, length: 4, data: new Uint32Array([4]).buffer },
    ]);
  });
});

describe('combineContiguousInstructions', () => {
  it('should combine contiguous instructions', () => {
    const instructions = [
      { start: 0, length: 4, data: new Uint32Array([3]).buffer },
      { start: 4, length: 4, data: new Uint32Array([4]).buffer },
      { start: 8, length: 4, data: new Uint32Array([5]).buffer },
      { start: 12, length: 4, data: new Uint32Array([6]).buffer },
    ];

    const combinedInstructions = combineContiguousInstructions(instructions);

    expect(combinedInstructions).toStrictEqual([
      { start: 0, length: 16, data: new Uint32Array([3, 4, 5, 6]).buffer },
    ]);
  });

  it('should not combine non-contiguous instructions', () => {
    const instructions = [
      { start: 0, length: 4, data: new Uint32Array([3]).buffer },
      { start: 8, length: 4, data: new Uint32Array([4]).buffer },
      { start: 16, length: 4, data: new Uint32Array([5]).buffer },
      { start: 24, length: 4, data: new Uint32Array([6]).buffer },
    ];

    const combinedInstructions = combineContiguousInstructions(instructions);

    expect(combinedInstructions).toStrictEqual(instructions);
  });

  it('should handle empty instructions', () => {
    const instructions = [] as WriteInstruction[];

    const combinedInstructions = combineContiguousInstructions(instructions);

    expect(combinedInstructions).toStrictEqual(instructions);
  });

  it('should handle partially contiguous instructions', () => {
    const instructions = [
      { start: 0, length: 4, data: new Uint32Array([3]).buffer },
      { start: 4, length: 4, data: new Uint32Array([4]).buffer },
      { start: 8, length: 4, data: new Uint32Array([5]).buffer },
      { start: 12, length: 4, data: new Uint32Array([6]).buffer },
      { start: 20, length: 4, data: new Uint32Array([7]).buffer },
    ];

    const combinedInstructions = combineContiguousInstructions(instructions);

    expect(combinedInstructions).toStrictEqual([
      { start: 0, length: 16, data: new Uint32Array([3, 4, 5, 6]).buffer },
      { start: 20, length: 4, data: new Uint32Array([7]).buffer },
    ]);
  });
});
