import { d, std } from 'typegpu';
import { gpuIt } from 'typegpu-testing-utility/gpu';
import { describe, expect } from 'vitest';
import { createBitonicSorter, createRadixSorter, prefixScan, reduce } from '../src/index.ts';

// A block of the scan kernel covers 2048 elements, so these sizes straddle one block,
// two blocks and the multi-level (block sums) path.
const SCAN_SIZES = [1, 7, 2047, 2048, 2049, 4097, 100_000];

function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function exclusiveScan(values: number[], op: (a: number, b: number) => number, identity: number) {
  const out: number[] = [];
  let acc = identity;
  for (const value of values) {
    out.push(acc);
    acc = op(acc, value);
  }
  return out;
}

describe('prefixScan on a real device', () => {
  for (const size of SCAN_SIZES) {
    gpuIt(`exclusive u32 sum, ${size} elements`, async ({ root }) => {
      const next = lcg(size);
      const input = Array.from({ length: size }, () => next() % 7);
      const buffer = root.createBuffer(d.arrayOf(d.u32, size), input).$usage('storage');

      prefixScan(root, buffer, { operation: std.add, identityElement: 0 });

      expect(await buffer.read()).toStrictEqual(exclusiveScan(input, (a, b) => a + b, 0));
    });
  }

  gpuIt('exclusive i32 max with negative values', async ({ root }) => {
    const size = 5000;
    const next = lcg(42);
    const input = Array.from({ length: size }, () => (next() % 2001) - 1000);
    const buffer = root.createBuffer(d.arrayOf(d.i32, size), input).$usage('storage');

    prefixScan(root, buffer, { operation: std.max, identityElement: -2147483647 });

    expect(await buffer.read()).toStrictEqual(exclusiveScan(input, Math.max, -2147483647));
  });
});

describe('reduce on a real device', () => {
  gpuIt('u32 sum over several blocks', async ({ root }) => {
    const size = 70_000;
    const next = lcg(7);
    const input = Array.from({ length: size }, () => next() % 5);
    const buffer = root.createBuffer(d.arrayOf(d.u32, size), input).$usage('storage');

    const result = reduce(root, buffer, { operation: std.add, identityElement: 0 });

    expect(await result.read()).toStrictEqual([input.reduce((a, b) => a + b, 0)]);
  });
});

describe('sorters on a real device', () => {
  gpuIt('bitonic sorts u32 keys ascending, size is not a power of two', async ({ root }) => {
    const size = 1000;
    const next = lcg(1);
    const input = Array.from({ length: size }, () => next());
    const keys = root.createBuffer(d.arrayOf(d.u32, size), input).$usage('storage');

    const sorter = createBitonicSorter(root, keys);
    sorter.run();

    expect(await keys.read()).toStrictEqual(input.toSorted((a, b) => a - b));
  });

  gpuIt('radix sorts u32 keys descending', async ({ root }) => {
    const size = 5000;
    const next = lcg(2);
    const input = Array.from({ length: size }, () => next());
    const keys = root.createBuffer(d.arrayOf(d.u32, size), input).$usage('storage');

    const sorter = createRadixSorter(root, keys, { direction: 'descending' });
    sorter.run();

    expect(await keys.read()).toStrictEqual(input.toSorted((a, b) => b - a));
  });
});
