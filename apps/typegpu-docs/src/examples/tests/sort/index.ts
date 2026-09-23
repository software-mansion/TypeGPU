import { tgpu, d } from 'typegpu';
import { createBitonicSorter, createRadixSorter } from '@typegpu/sort';

const root = await tgpu.init();
const result = document.querySelector<HTMLDivElement>('.result');
if (!result) {
  throw new Error('Nowhere to display the results');
}

function assertEqual(actual: number[], expected: number[], message: string) {
  if (actual.length !== expected.length || actual.some((value, i) => value !== expected[i])) {
    throw new Error(message);
  }
}

async function testBitonic() {
  for (const size of [3, 513]) {
    for (const descending of [false, true]) {
      const input = Array.from({ length: size }, (_, i) => (i % 3 === 1 ? 0xffffffff : 0));
      const keys = root.createBuffer(d.arrayOf(d.u32, size), input).$usage('storage');
      const values = root
        .createBuffer(
          d.arrayOf(d.vec2u, size),
          input.map((value, i) => d.vec2u(i, value)),
        )
        .$usage('storage');
      const sorter = createBitonicSorter(root, keys, {
        values,
        compare: (a, b) => {
          'use gpu';
          return descending ? a > b : a < b;
        },
      });

      for (let run = 0; run < 2; run++) {
        sorter.run();
        const sorted = await keys.read();
        const payload = await values.read();
        assertEqual(
          sorted,
          input.toSorted((a, b) => (descending ? b - a : a - b)),
          `Bitonic key order (${size} keys, descending: ${descending})`,
        );
        assertEqual(
          payload.map((v) => v.x).toSorted((a, b) => a - b),
          input.map((_, i) => i),
          'Bitonic lost or duplicated a payload',
        );
        assertEqual(
          payload.map((v) => input[v.x]),
          sorted,
          'Bitonic payload/key mismatch',
        );
        assertEqual(
          payload.map((v) => v.y),
          sorted,
          'Bitonic composite payload was corrupted',
        );
      }
      sorter.destroy();
      keys.destroy();
      values.destroy();
    }
  }
}

async function testRadix() {
  const input = Array.from({ length: 4099 }, (_, i) => (Math.imul(i, 2654435761) >>> 0) & 511);
  for (const direction of ['ascending', 'descending'] as const) {
    for (const keyBits of [8, 9]) {
      const mask = 2 ** keyBits - 1;
      const keys = root.createBuffer(d.arrayOf(d.u32, input.length), input).$usage('storage');
      const values = root
        .createBuffer(
          d.arrayOf(d.u32, input.length),
          input.map((_, i) => i),
        )
        .$usage('storage');
      const out = {
        keys: root.createBuffer(keys.dataType).$usage('storage'),
        values: root.createBuffer(values.dataType).$usage('storage'),
      };
      const sorter = createRadixSorter(root, keys, { values, out, keyBits, direction });
      sorter.run();

      const expected = input
        .map((_, i) => i)
        .toSorted((a, b) => {
          const diff = (input[a] & mask) - (input[b] & mask);
          return direction === 'ascending' ? diff : -diff;
        });
      assertEqual(
        await out.values.read(),
        expected,
        `Radix stability (${direction}, ${keyBits} bits)`,
      );
      assertEqual(
        await out.keys.read(),
        expected.map((i) => input[i]),
        'Radix key order',
      );
      assertEqual(await keys.read(), input, 'Radix modified input keys');
      assertEqual(
        await values.read(),
        input.map((_, i) => i),
        'Radix modified input values',
      );
      sorter.destroy();
      keys.destroy();
      values.destroy();
      out.keys.destroy();
      out.values.destroy();
    }
  }
}

async function testRadixAliases() {
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
  assertEqual(await keys.read(), [0, 1, 2], 'Radix aliased key order');
  assertEqual(await values.read(), [12, 11, 10], 'Radix aliased payload order');
  sorter.destroy();
  keys.destroy();
  values.destroy();
}

try {
  await testBitonic();
  await testRadix();
  await testRadixAliases();
  result.innerText = 'Tests succeeded.';
} catch (error) {
  result.innerText = `Tests failed: ${error}`;
  console.error(error);
}

export function onCleanup() {
  root.destroy();
}
