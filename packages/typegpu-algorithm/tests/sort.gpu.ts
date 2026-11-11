import { d, std, type TgpuRoot } from 'typegpu';
import { gpuIt, lcg } from 'typegpu-testing-utility/gpu';
import { describe, expect } from 'vitest';
import { bitonicSort, prefixScan, radixSort } from '../src/index.ts';

/** Records `instance.step` into a fresh pass and submits it */
function run(root: TgpuRoot, instance: { step(pass: GPUComputePassEncoder): void }) {
  const encoder = root.device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  instance.step(pass);
  pass.end();
  root.device.queue.submit([encoder.finish()]);
}

// A block of the scan kernel covers 2048 elements, so these sizes straddle one block,
// two blocks and the multi-level (block sums) path.
const SCAN_SIZES = [1, 7, 2047, 2048, 2049, 4097, 100_000];
// The radix tile is 2048 keys, the bitonic sorter pads to a power of two.
const RADIX_SIZES = [1, 2, 3, 255, 256, 257, 2047, 2048, 2049, 5000];
const BITONIC_SIZES = [1, 2, 3, 255, 1000, 1024, 1025];
const SEEDS = [1, 2, 3];

const keyTypes = {
  u32: { schema: d.u32, make: (next: () => number) => next() },
  i32: { schema: d.i32, make: (next: () => number) => next() | 0 },
  // Multiples of 1/64 stay exactly representable in f32, so CPU and GPU agree bit for bit.
  f32: {
    schema: d.f32,
    make: (next: () => number) => ((next() % 200_001) - 100_000) / 64,
  },
} as const;
type KeyName = keyof typeof keyTypes;

const ascending = (a: number, b: number) => a - b;
const descending = (a: number, b: number) => b - a;

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

      prefixScan.scan(root, buffer, { operation: std.add, identityElement: 0 });

      expect(await buffer.read()).toStrictEqual(exclusiveScan(input, (a, b) => a + b, 0));
    });
  }

  gpuIt('exclusive i32 max with negative values', async ({ root }) => {
    const size = 5000;
    const next = lcg(42);
    const input = Array.from({ length: size }, () => (next() % 2001) - 1000);
    const buffer = root.createBuffer(d.arrayOf(d.i32, size), input).$usage('storage');

    prefixScan.scan(root, buffer, {
      operation: std.max,
      identityElement: -2147483647,
    });

    expect(await buffer.read()).toStrictEqual(exclusiveScan(input, Math.max, -2147483647));
  });
});

describe('reduce on a real device', () => {
  gpuIt('u32 sum over several blocks', async ({ root }) => {
    const size = 70_000;
    const next = lcg(7);
    const input = Array.from({ length: size }, () => next() % 5);
    const buffer = root.createBuffer(d.arrayOf(d.u32, size), input).$usage('storage');

    const result = prefixScan.reduce(root, buffer, {
      operation: std.add,
      identityElement: 0,
    });

    expect(await result.read()).toStrictEqual([input.reduce((a, b) => a + b, 0)]);
  });
});

describe('radix sorter on a real device', () => {
  for (const [name, { schema, make }] of Object.entries(keyTypes) as [
    KeyName,
    (typeof keyTypes)[KeyName],
  ][]) {
    for (const direction of ['ascending', 'descending'] as const) {
      for (const size of RADIX_SIZES) {
        gpuIt(`${name} keys ${direction}, ${size} elements`, async ({ root }) => {
          for (const seed of SEEDS) {
            const next = lcg(seed * 1000 + size);
            const input = Array.from({ length: size }, () => make(next));
            const keys = root.createBuffer(d.arrayOf(schema, size), input).$usage('storage');

            run(
              root,
              radixSort.defineAndInstantiate(root, { keyType: schema, direction }, { keys }),
            );

            const expected = input.toSorted(direction === 'ascending' ? ascending : descending);
            expect(await keys.read(), `seed ${seed}`).toStrictEqual(expected);
          }
        });
      }
    }
  }

  gpuIt('f32 keys keep the input order of -0 and 0 and handle both signs', async ({ root }) => {
    const input = [3, -0, -2.5, 0, 2.5, -0, 0, Math.fround(-1e30), Math.fround(1e30), 0];
    const keys = root.createBuffer(d.arrayOf(d.f32, input.length), input).$usage('storage');

    run(root, radixSort.defineAndInstantiate(root, { keyType: d.f32 }, { keys }));

    expect(await keys.read()).toStrictEqual(input.toSorted(ascending));
  });

  for (const direction of ['ascending', 'descending'] as const) {
    gpuIt(`is stable with a payload, many duplicate keys, ${direction}`, async ({ root }) => {
      const size = 5000;
      const next = lcg(11);
      const input = Array.from({ length: size }, () => next() % 16);
      const keys = root.createBuffer(d.arrayOf(d.u32, size), input).$usage('storage');
      const indices = root
        .createBuffer(
          d.arrayOf(d.u32, size),
          input.map((_, i) => i),
        )
        .$usage('storage');

      run(
        root,
        radixSort.defineAndInstantiate(
          root,
          { keyType: d.u32, valueType: d.u32, direction },
          { keys, values: indices },
        ),
      );

      const order = input
        .map((key, index) => ({ key, index }))
        .toSorted((a, b) => (direction === 'ascending' ? a.key - b.key : b.key - a.key));
      expect(await keys.read()).toStrictEqual(order.map((e) => e.key));
      expect(await indices.read()).toStrictEqual(order.map((e) => e.index));
    });
  }

  gpuIt('out buffers receive the result and the inputs stay untouched', async ({ root }) => {
    const size = 3000;
    const next = lcg(5);
    const input = Array.from({ length: size }, () => next() % 1000);
    const keys = root.createBuffer(d.arrayOf(d.u32, size), input).$usage('storage');
    const outKeys = root.createBuffer(d.arrayOf(d.u32, size)).$usage('storage');
    const payload = root
      .createBuffer(
        d.arrayOf(d.u32, size),
        input.map((_, i) => i),
      )
      .$usage('storage');
    const outPayload = root.createBuffer(d.arrayOf(d.u32, size)).$usage('storage');

    run(
      root,
      radixSort.defineAndInstantiate(
        root,
        { keyType: d.u32, valueType: d.u32 },
        { keys, values: payload, out: { keys: outKeys, values: outPayload } },
      ),
    );

    const order = input.map((key, index) => ({ key, index })).toSorted((a, b) => a.key - b.key);
    expect(await outKeys.read()).toStrictEqual(order.map((e) => e.key));
    expect(await outPayload.read()).toStrictEqual(order.map((e) => e.index));
    expect(await keys.read()).toStrictEqual(input);
    expect(await payload.read()).toStrictEqual(input.map((_, i) => i));
  });

  gpuIt('range with keyBits sorts a narrow u32 key', async ({ root }) => {
    const size = 4000;
    const next = lcg(9);
    const input = Array.from({ length: size }, () => 100 + (next() % 200));
    const keys = root.createBuffer(d.arrayOf(d.u32, size), input).$usage('storage');

    run(
      root,
      radixSort.defineAndInstantiate(root, { keyType: d.u32, range: [100, 299] }, { keys }),
    );

    expect(await keys.read()).toStrictEqual(input.toSorted(ascending));
  });

  gpuIt('can run repeatedly on refreshed data', async ({ root }) => {
    const size = 2500;
    const keys = root.createBuffer(d.arrayOf(d.u32, size)).$usage('storage');
    const sorter = radixSort.defineAndInstantiate(root, { keyType: d.u32 }, { keys });

    for (const seed of [21, 22]) {
      const next = lcg(seed);
      const input = Array.from({ length: size }, () => next());
      keys.write(input);
      run(root, sorter);
      expect(await keys.read()).toStrictEqual(input.toSorted(ascending));
    }
  });
});

describe('bitonic sorter on a real device', () => {
  for (const [name, { schema, make }] of Object.entries(keyTypes) as [
    KeyName,
    (typeof keyTypes)[KeyName],
  ][]) {
    for (const size of BITONIC_SIZES) {
      gpuIt(`${name} keys ascending, ${size} elements`, async ({ root }) => {
        for (const seed of SEEDS) {
          const next = lcg(seed * 1000 + size);
          const input = Array.from({ length: size }, () => make(next));
          const keys = root.createBuffer(d.arrayOf(schema, size), input).$usage('storage');

          run(root, bitonicSort.defineAndInstantiate(root, { keyType: schema }, { keys }));

          expect(await keys.read(), `seed ${seed}`).toStrictEqual(input.toSorted(ascending));
        }
      });
    }
  }

  gpuIt('custom compare sorts descending', async ({ root }) => {
    const size = 1000;
    const next = lcg(3);
    const input = Array.from({ length: size }, () => next());
    const keys = root.createBuffer(d.arrayOf(d.u32, size), input).$usage('storage');

    const compare = (a: number, b: number) => {
      'use gpu';
      return a > b;
    };
    run(root, bitonicSort.defineAndInstantiate(root, { keyType: d.u32, compare }, { keys }));

    expect(await keys.read()).toStrictEqual(input.toSorted(descending));
  });

  gpuIt('moves the payload with its key (permutation check, ties allowed)', async ({ root }) => {
    const size = 1500;
    const next = lcg(13);
    const input = Array.from({ length: size }, () => next() % 50);
    const keys = root.createBuffer(d.arrayOf(d.u32, size), input).$usage('storage');
    const indices = root
      .createBuffer(
        d.arrayOf(d.u32, size),
        input.map((_, i) => i),
      )
      .$usage('storage');

    run(
      root,
      bitonicSort.defineAndInstantiate(
        root,
        { keyType: d.u32, valueType: d.u32 },
        { keys, values: indices },
      ),
    );

    const sortedKeys = await keys.read();
    const sortedIndices = await indices.read();
    expect(sortedKeys).toStrictEqual(input.toSorted(ascending));
    expect(sortedIndices.toSorted(ascending)).toStrictEqual(input.map((_, i) => i));
    expect(sortedIndices.map((i) => input[i])).toStrictEqual(sortedKeys);
  });

  gpuIt('can run repeatedly on refreshed data', async ({ root }) => {
    const size = 777;
    const keys = root.createBuffer(d.arrayOf(d.u32, size)).$usage('storage');
    const sorter = bitonicSort.defineAndInstantiate(root, { keyType: d.u32 }, { keys });

    for (const seed of [31, 32]) {
      const next = lcg(seed);
      const input = Array.from({ length: size }, () => next());
      keys.write(input);
      run(root, sorter);
      expect(await keys.read()).toStrictEqual(input.toSorted(ascending));
    }
  });
});
