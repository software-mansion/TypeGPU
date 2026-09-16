import { afterEach, beforeEach, expect, test } from 'vitest';
import { tgpu, d, type TgpuRoot } from 'typegpu';
import { createBitonicSorter, createRadixSorter } from '@typegpu/sort';

let root: TgpuRoot;

beforeEach(async () => {
  root = await tgpu.init();
  root.device.pushErrorScope('validation');
});

afterEach(async () => {
  const error = await root.device.popErrorScope();
  root.destroy();
  expect(error?.message).toBeUndefined();
});

test.each([3, 255, 256, 257, 512, 513, 1024, 1025])(
  'bitonic preserves payloads tied with padding at size %i',
  async (size) => {
    for (const descending of [false, true]) {
      const paddingValue = descending ? 0 : 0xffffffff;
      const input = Array.from({ length: size }, (_, i) => (i % 3 === 1 ? paddingValue : 1));
      const indices = input.map((_, i) => i + 1);
      const keys = root.createBuffer(d.arrayOf(d.u32, size), input).$usage('storage');
      const values = root.createBuffer(d.arrayOf(d.u32, size), indices).$usage('storage');
      const sorter = createBitonicSorter(root, keys, {
        values,
        paddingValue,
        compare: (a, b) => {
          'use gpu';
          return descending ? a > b : a < b;
        },
      });

      for (let run = 0; run < 2; run++) {
        keys.write(input);
        values.write(indices);
        sorter.run();
        const sortedKeys = await keys.read();
        const sortedValues = await values.read();
        expect(sortedKeys).toEqual(input.toSorted((a, b) => (descending ? b - a : a - b)));
        expect(sortedValues.toSorted((a, b) => a - b)).toEqual(indices);
        expect(sortedKeys).toEqual(sortedValues.map((index) => input[index - 1]));
      }
      sorter.destroy();
    }
  },
);

test('bitonic preserves distinct keys that compare equal to padding', async () => {
  const keys = root.createBuffer(d.arrayOf(d.u32, 3), [0, 98, 0]).$usage('storage');
  const sorter = createBitonicSorter(root, keys, {
    paddingValue: 99,
    compare: (a, b) => {
      'use gpu';
      return d.u32(a / 10) < d.u32(b / 10);
    },
  });
  sorter.run();
  expect(await keys.read()).toEqual([0, 0, 98]);
  sorter.destroy();
});

test('radix supports output wrappers around the input GPU buffers', async () => {
  const keys = root.createBuffer(d.arrayOf(d.u32, 3), [2, 1, 0]).$usage('storage');
  const values = root.createBuffer(d.arrayOf(d.u32, 3), [10, 11, 12]).$usage('storage');
  const sorter = createRadixSorter(root, keys, {
    keyBits: 8,
    values,
    out: {
      keys: root.createBuffer(keys.dataType, keys.buffer).$usage('storage'),
      values: root.createBuffer(values.dataType, values.buffer).$usage('storage'),
    },
  });
  sorter.run();
  expect(await keys.read()).toEqual([0, 1, 2]);
  expect(await values.read()).toEqual([12, 11, 10]);
  sorter.destroy();
});
