import { d, std } from 'typegpu';
import { gpuIt, lcg } from 'typegpu-testing-utility/gpu';
import { describe, expect } from 'vitest';
import { createChunkedScan, prefixScan, reduce } from '../src/index.ts';

// x -> a * x + b over u32 with wrap-around: exact on both sides and not commutative.
const Affine = d.struct({ a: d.u32, b: d.u32 });
type Affine = d.Infer<typeof Affine>;

const then = (f: Affine, g: Affine) => {
  'use gpu';
  return Affine({ a: g.a * f.a, b: g.a * f.b + g.b });
};
const thenOnCpu = (f: Affine, g: Affine): Affine => ({
  a: Math.imul(g.a, f.a) >>> 0,
  b: (Math.imul(g.a, f.b) + g.b) >>> 0,
});
const affineOp = { operation: then, identityElement: { a: 1, b: 0 } };

function randomMaps(size: number, seed: number): Affine[] {
  const next = lcg(seed);
  return Array.from({ length: size }, () => ({ a: (next() % 5) + 1, b: next() % 1000 }));
}

// An 8-byte struct scans in blocks of 2048, like a scalar.
const SIZES = [1, 7, 2047, 2048, 2049, 4097, 100_000];

describe('prefixScan over structs on a real device', () => {
  for (const size of SIZES) {
    gpuIt(`exclusive composition of affine maps, ${size} elements`, async ({ root }) => {
      const input = randomMaps(size, size);
      const buffer = root.createBuffer(d.arrayOf(Affine, size), input).$usage('storage');

      prefixScan(root, buffer, affineOp);

      const expected: Affine[] = [];
      let acc = affineOp.identityElement;
      for (const map of input) {
        expected.push(acc);
        acc = thenOnCpu(acc, map);
      }
      expect(await buffer.read()).toStrictEqual(expected);
    });
  }

  gpuIt('vector elements', async ({ root }) => {
    const size = 5000;
    const next = lcg(3);
    const input = Array.from({ length: size }, () => d.vec2u(next() % 9, next() % 9));
    const buffer = root.createBuffer(d.arrayOf(d.vec2u, size), input).$usage('storage');

    prefixScan(root, buffer, { operation: std.add, identityElement: d.vec2u() });

    const out = await buffer.read();
    let x = 0;
    let y = 0;
    for (let i = 0; i < size; i++) {
      expect([out[i]?.x, out[i]?.y]).toStrictEqual([x, y]);
      x += input[i]?.x ?? 0;
      y += input[i]?.y ?? 0;
    }
  });

  gpuIt('reduces structs over several blocks', async ({ root }) => {
    const input = randomMaps(70_000, 9);
    const buffer = root.createBuffer(d.arrayOf(Affine, input.length), input).$usage('storage');

    const result = reduce(root, buffer, affineOp);

    expect(await result.read()).toStrictEqual([input.reduce(thenOnCpu, affineOp.identityElement)]);
  });
});

describe('prefixScan with a non-commutative scalar operation on a real device', () => {
  // A 4-state automaton as a table packed into a u32, two bits per state.
  const compose = (f: number, g: number) => {
    'use gpu';
    let out = d.u32(0);
    for (let state = d.u32(0); state < 4; state++) {
      const mid = (f >> (2 * state)) & 3;
      out |= ((g >> (2 * mid)) & 3) << (2 * state);
    }
    return out;
  };
  const composeOnCpu = (f: number, g: number) => {
    let out = 0;
    for (let state = 0; state < 4; state++) {
      const mid = (f >> (2 * state)) & 3;
      out |= ((g >> (2 * mid)) & 3) << (2 * state);
    }
    return out;
  };
  const IDENTITY = 0b11100100;

  gpuIt('composes transition tables in order', async ({ root }) => {
    const size = 50_000;
    const next = lcg(11);
    const input = Array.from({ length: size }, () => next() % 256);
    const buffer = root.createBuffer(d.arrayOf(d.u32, size), input).$usage('storage');

    prefixScan(root, buffer, { operation: compose, identityElement: IDENTITY });

    const expected: number[] = [];
    let acc = IDENTITY;
    for (const table of input) {
      expected.push(acc);
      acc = composeOnCpu(acc, table);
    }
    expect(await buffer.read()).toStrictEqual(expected);
  });
});

describe('createChunkedScan on a real device', () => {
  for (const [length, chunkSize] of [
    [1, 64],
    [1000, 64],
    [300_001, 1000],
    [300_000, 100],
  ] as const) {
    gpuIt(`one sequence of ${length} elements in chunks of ${chunkSize}`, async ({ root }) => {
      const input = randomMaps(length, length);
      const maps = root.createReadonly(d.arrayOf(Affine, length), input);
      const values = root.createMutable(d.arrayOf(d.u32, length));

      const plan = createChunkedScan(root, {
        ...affineOp,
        elementType: Affine,
        length,
        chunkSize,
        element: (_row, index) => {
          'use gpu';
          return Affine(maps.$[index]);
        },
        emit: (_row, index, prefix) => {
          'use gpu';
          values.$[index] = prefix.b;
        },
      });
      plan.run();
      plan.destroy();

      // The value x reaches from 0 is the `b` of the composed map.
      const expected: number[] = [];
      let x = 0;
      for (const map of input) {
        x = (Math.imul(map.a, x) + map.b) >>> 0;
        expected.push(x);
      }
      expect(await values.read()).toStrictEqual(expected);
    });
  }

  gpuIt(
    'scalar elements, with the chunk totals going through the scalar scan',
    async ({ root }) => {
      const length = 300_001;
      const next = lcg(13);
      const input = Array.from({ length }, () => next() % 7);
      const source = root.createReadonly(d.arrayOf(d.u32, length), input);
      const sums = root.createMutable(d.arrayOf(d.u32, length));

      const plan = createChunkedScan(root, {
        elementType: d.u32,
        operation: std.add,
        identityElement: 0,
        length,
        chunkSize: 100,
        element: (_row, index) => {
          'use gpu';
          return source.$[index];
        },
        emit: (_row, index, prefix) => {
          'use gpu';
          sums.$[index] = prefix;
        },
      });
      plan.run();
      plan.destroy();

      let acc = 0;
      expect(await sums.read()).toStrictEqual(input.map((value) => (acc += value)));
    },
  );

  gpuIt('rejects sizes that do not fit a dispatch', ({ root }) => {
    const options = {
      elementType: d.u32,
      operation: std.add,
      identityElement: 0,
      length: 1000,
      element: (_row: number, index: number) => {
        'use gpu';
        return index;
      },
      emit: () => {
        'use gpu';
      },
    };

    expect(() => createChunkedScan(root, { ...options, rows: 5_000_000 })).toThrow();
    expect(() => createChunkedScan(root, { ...options, chunkSize: Number.NaN })).toThrow();
    expect(() => createChunkedScan(root, { ...options, length: 0 })).toThrow();
  });

  gpuIt('independent rows stored index by index', async ({ root }) => {
    const rows = 70;
    const length = 3001;
    const input = randomMaps(rows * length, 5);
    const maps = root.createReadonly(d.arrayOf(Affine, rows * length), input);
    const values = root.createMutable(d.arrayOf(d.u32, rows * length));

    const plan = createChunkedScan(root, {
      ...affineOp,
      elementType: Affine,
      rows,
      length,
      chunkSize: 100,
      element: (row, index) => {
        'use gpu';
        return Affine(maps.$[index * rows + row]);
      },
      emit: (row, index, prefix) => {
        'use gpu';
        values.$[index * rows + row] = prefix.b;
      },
    });
    plan.run();
    plan.destroy();

    const expected = Array.from({ length: rows * length }, () => 0);
    for (let row = 0; row < rows; row++) {
      let x = 0;
      for (let index = 0; index < length; index++) {
        const map = input[index * rows + row];
        x = (Math.imul(map?.a ?? 0, x) + (map?.b ?? 0)) >>> 0;
        expected[index * rows + row] = x;
      }
    }
    expect(await values.read()).toStrictEqual(expected);
  });
});
