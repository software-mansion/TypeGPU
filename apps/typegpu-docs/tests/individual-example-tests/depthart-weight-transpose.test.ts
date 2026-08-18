import { describe, expect, it } from 'vitest';
import {
  transposeLanePairs,
  type WeightTranspose,
} from '../../src/examples/image-processing/monocular-light-injection/inference/gpu-resources.ts';

/**
 * The bundle packs a convolution tile as `((tile * 4 + outputLane) * 4 + inputLane)`.
 * The outer-product kernel reads `((tile * 4 + inputLane) * 4 + outputLane)`, so
 * upload swaps the two lanes. A wrong permutation here produces a plausible but
 * silently wrong convolution, which is why it is pinned directly.
 */
function transpose(elements: number[], elementBytes: 2 | 4): number[] {
  const target = new ArrayBuffer(elements.length * elementBytes);
  const view = elementBytes === 2 ? new Uint16Array(target) : new Uint32Array(target);
  view.set(elements);
  const descriptor: WeightTranspose = {
    tensorId: 'test',
    byteOffset: 0,
    byteLength: target.byteLength,
    elementBytes,
  };
  transposeLanePairs(target, descriptor, target.byteLength);
  return [...view];
}

describe('weight lane transpose', () => {
  it('swaps the output and input lane of every 4x4 tile', () => {
    const identity = Array.from({ length: 16 }, (_, index) => index);
    expect(transpose(identity, 2)).toEqual([0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15]);
  });

  it('is its own inverse', () => {
    const values = Array.from({ length: 32 }, (_, index) => (index * 37) % 251);
    expect(transpose(transpose(values, 2), 2)).toEqual(values);
  });

  it('treats each 4x4 tile independently', () => {
    const two = [...Array.from({ length: 16 }, (_, i) => i), ...Array(16).fill(0)];
    const result = transpose(two, 4);
    expect(result.slice(0, 16)).toEqual([0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15]);
    expect(result.slice(16)).toEqual(Array(16).fill(0));
  });

  it('moves FP32 lanes the same way as FP16 lanes', () => {
    const identity = Array.from({ length: 16 }, (_, index) => index);
    expect(transpose(identity, 4)).toEqual(transpose(identity, 2));
  });

  it('rejects a range that is not a whole number of tiles', () => {
    const target = new ArrayBuffer(24);
    expect(() =>
      transposeLanePairs(
        target,
        { tensorId: 'ragged', byteOffset: 0, byteLength: 24, elementBytes: 2 },
        24,
      ),
    ).toThrow(/4x4 lane tiles/);
  });

  it('rejects a range outside the payload', () => {
    const target = new ArrayBuffer(32);
    expect(() =>
      transposeLanePairs(
        target,
        { tensorId: 'stray', byteOffset: 16, byteLength: 32, elementBytes: 2 },
        32,
      ),
    ).toThrow(/outside the bundle payload/);
  });
});
