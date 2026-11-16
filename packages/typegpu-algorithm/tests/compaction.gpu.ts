import { d, std, type TgpuRoot } from 'typegpu';
import { gpuIt, lcg } from 'typegpu-testing-utility/gpu';
import { describe, expect } from 'vitest';
import {
  type CompactBuffer,
  type CompactionPlan,
  createPartition,
  createRunLengthEncode,
  createSelect,
  createUnique,
} from '../src/index.ts';

// u32 tiles hold 2048 elements, 8 per thread.
const SIZES = [1, 7, 9, 2047, 2048, 2049, 4097, 100_000];
const PRIMITIVES = ['select', 'partition', 'unique', 'runLengthEncode'] as const;
type Primitive = (typeof PRIMITIVES)[number];

const Particle = d.struct({ id: d.u32, position: d.vec3f });

interface Kind<T> {
  schema: d.AnyWgslData;
  predicate: (value: T) => boolean;
  equal?: (a: T, b: T) => boolean;
  keepOnCpu: (value: T) => boolean;
  equalOnCpu: (a: T, b: T) => boolean;
  /** `bit` decides the predicate, `key` the runs */
  make: (bit: number, key: number) => T;
}

const u32Kind: Kind<number> = {
  schema: d.u32,
  predicate: (v) => {
    'use gpu';
    return v % 2 === 1;
  },
  keepOnCpu: (v) => v % 2 === 1,
  equalOnCpu: (a, b) => a === b,
  make: (bit, key) => key * 2 + bit,
};

const vecKind: Kind<d.v2u> = {
  schema: d.vec2u,
  predicate: (v) => {
    'use gpu';
    return v.y === 1;
  },
  keepOnCpu: (v) => v.y === 1,
  equalOnCpu: (a, b) => a.x === b.x && a.y === b.y,
  make: (bit, key) => d.vec2u(key, bit),
};

type Particle = d.Infer<typeof Particle>;
const structKind: Kind<Particle> = {
  schema: Particle,
  predicate: (p) => {
    'use gpu';
    return p.position.y > 0;
  },
  // Runs follow the id alone, so the first element of a run is observable.
  equal: (a, b) => {
    'use gpu';
    return a.id === b.id;
  },
  keepOnCpu: (p) => p.position.y > 0,
  equalOnCpu: (a, b) => a.id === b.id,
  make: (bit, key) => ({ id: key, position: d.vec3f(key, bit - 0.5, key % 7) }),
};

const kinds = { u32: u32Kind, vec2u: vecKind, struct: structKind } as Record<string, Kind<unknown>>;

function reference<T>(kind: Kind<T>, primitive: Primitive, input: T[]) {
  if (primitive === 'select' || primitive === 'partition') {
    const kept = input.filter(kind.keepOnCpu);
    const rejected = input.filter((v) => !kind.keepOnCpu(v));
    return { values: primitive === 'select' ? kept : [...kept, ...rejected], count: kept.length };
  }
  const values: T[] = [];
  const lengths: number[] = [];
  input.forEach((v, i) => {
    if (i === 0 || !kind.equalOnCpu(input[i - 1], v)) {
      values.push(v);
      lengths.push(0);
    }
    lengths[lengths.length - 1] = (lengths.at(-1) ?? 0) + 1;
  });
  return { values, count: values.length, ...(primitive === 'runLengthEncode' && { lengths }) };
}

function createPlan<T>(
  root: TgpuRoot,
  kind: Kind<T>,
  primitive: Primitive,
  input: CompactBuffer,
  out: CompactBuffer,
  lengths: CompactBuffer<d.U32>,
): CompactionPlan {
  const predicate = kind.predicate as (v: unknown) => boolean;
  const equal = kind.equal as ((a: unknown, b: unknown) => boolean) | undefined;
  switch (primitive) {
    case 'select':
      return createSelect(root, input, { predicate, out });
    case 'partition':
      return createPartition(root, input, { predicate, out });
    case 'unique':
      return createUnique(root, input, { out, ...(equal && { equal }) });
    case 'runLengthEncode':
      return createRunLengthEncode(root, input, {
        out: { values: out, lengths },
        ...(equal && { equal }),
      });
  }
}

async function check<T>(root: TgpuRoot, kind: Kind<T>, primitive: Primitive, input: T[]) {
  const size = input.length;
  const schema = d.arrayOf(kind.schema, size);
  const inputBuffer = root.createBuffer(schema, input as never).$usage('storage');
  const out = root.createBuffer(schema).$usage('storage');
  const lengths = root.createBuffer(d.arrayOf(d.u32, size)).$usage('storage');
  const plan = createPlan(root, kind, primitive, inputBuffer, out, lengths);

  plan.run();

  const expected = reference(kind, primitive, input);
  const count = await plan.countBuffer.read();
  expect(count).toBe(expected.count);
  const values = (await out.read()) as T[];
  expect(values.slice(0, expected.values.length)).toStrictEqual(expected.values);
  if (expected.lengths) {
    expect((await lengths.read()).slice(0, count)).toStrictEqual(expected.lengths);
  }
  plan.destroy();
}

function randomInput<T>(kind: Kind<T>, size: number, seed: number): T[] {
  const next = lcg(seed);
  return Array.from({ length: size }, () => kind.make(next() % 2, next() % 3));
}

describe('compaction of u32 on a real device', () => {
  for (const size of SIZES) {
    for (const primitive of PRIMITIVES) {
      gpuIt(`${primitive}, ${size} random elements`, async ({ root }) => {
        await check(root, u32Kind, primitive, randomInput(u32Kind, size, size));
      });
    }
  }
});

describe('compaction patterns on a real device', () => {
  const patterns = {
    'all kept, all distinct': (i: number) => u32Kind.make(1, i),
    'none kept, one run': () => u32Kind.make(0, 5),
    alternating: (i: number) => u32Kind.make(i % 2, 0),
    'runs of 3': (i: number) => u32Kind.make(1, Math.floor(i / 3)),
    // Runs and kept stretches crossing thread (8) and tile (2048) boundaries.
    'runs of 17': (i: number) => u32Kind.make(Math.floor(i / 17) % 2, Math.floor(i / 17)),
    'runs of 5000': (i: number) => u32Kind.make(Math.floor(i / 5000) % 2, Math.floor(i / 5000)),
  };
  for (const size of [4097, 100_000]) {
    for (const [name, make] of Object.entries(patterns)) {
      for (const primitive of PRIMITIVES) {
        gpuIt(`${primitive}, ${name}, ${size} elements`, async ({ root }) => {
          await check(
            root,
            u32Kind,
            primitive,
            Array.from({ length: size }, (_, i) => make(i)),
          );
        });
      }
    }
  }
});

describe('compaction with a multi-level scan of the tile counts on a real device', () => {
  // More than 2048 tiles of 2048 elements, so the scan of the tile counts takes two levels.
  const size = 2049 * 2048 + 5;
  for (const primitive of PRIMITIVES) {
    gpuIt(`${primitive}, ${size} random elements`, async ({ root }) => {
      await check(root, u32Kind, primitive, randomInput(u32Kind, size, 3));
    });
  }
});

describe('compaction of vectors and structs on a real device', () => {
  for (const [kindName, kind] of Object.entries(kinds).filter(([name]) => name !== 'u32')) {
    for (const size of [7, 4097, 100_000]) {
      for (const primitive of PRIMITIVES) {
        gpuIt(`${primitive}, ${kindName}, ${size} elements`, async ({ root }) => {
          await check(root, kind, primitive, randomInput(kind, size, size + 1));
        });
      }
    }
  }
});

describe('compaction inside larger buffers on a real device', () => {
  gpuIt('reads and writes only the viewed elements', async ({ root }) => {
    const capacity = 8192;
    const size = 5000;
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    const rawInput = root.device.createBuffer({ size: capacity * 4, usage });
    const rawOut = root.device.createBuffer({ size: capacity * 4, usage });
    const rawLengths = root.device.createBuffer({ size: capacity * 4, usage });
    // Odd and distinct past the view, so reading beyond it would change every result.
    const tail = Array.from({ length: capacity }, (_, i) => 2 * i + 1);
    for (const raw of [rawInput, rawOut, rawLengths]) {
      root.device.queue.writeBuffer(raw, 0, new Uint32Array(tail));
    }

    const input = Array.from({ length: size }, (_, i) => u32Kind.make(i % 3 === 0 ? 1 : 0, 0));
    const view = root.createBuffer(d.arrayOf(d.u32, size), rawInput).$usage('storage');
    view.write(input);
    const out = root.createBuffer(d.arrayOf(d.u32, size), rawOut).$usage('storage');
    const lengths = root.createBuffer(d.arrayOf(d.u32, size), rawLengths).$usage('storage');
    const wholeOut = root.createBuffer(d.arrayOf(d.u32, capacity), rawOut);
    const wholeLengths = root.createBuffer(d.arrayOf(d.u32, capacity), rawLengths);

    for (const primitive of PRIMITIVES) {
      const plan = createPlan(root, u32Kind, primitive, view, out, lengths);
      plan.run();
      const expected = reference(u32Kind, primitive, input);
      expect(await plan.countBuffer.read()).toBe(expected.count);
      const whole = await wholeOut.read();
      expect(whole.slice(0, expected.values.length)).toStrictEqual(expected.values);
      expect(whole.slice(size)).toStrictEqual(tail.slice(size));
      if (expected.lengths) {
        const allLengths = await wholeLengths.read();
        expect(allLengths.slice(0, expected.count)).toStrictEqual(expected.lengths);
        expect(allLengths.slice(size)).toStrictEqual(tail.slice(size));
      }
      plan.destroy();
    }

    for (const raw of [rawInput, rawOut, rawLengths]) {
      raw.destroy();
    }
  });

  gpuIt('reruns a plan on new data recorded into an encoder', async ({ root }) => {
    const size = 3000;
    const inputBuffer = root.createBuffer(d.arrayOf(d.u32, size)).$usage('storage');
    const out = root.createBuffer(d.arrayOf(d.u32, size)).$usage('storage');
    const lengths = root.createBuffer(d.arrayOf(d.u32, size)).$usage('storage');
    const plan = createRunLengthEncode(root, inputBuffer, { out: { values: out, lengths } });

    for (const seed of [1, 2]) {
      const input = randomInput(u32Kind, size, seed);
      inputBuffer.write(input);
      const encoder = root.device.createCommandEncoder();
      plan.run({ encoder });
      root.device.queue.submit([encoder.finish()]);

      const expected = reference(u32Kind, 'runLengthEncode', input);
      expect(await plan.countBuffer.read()).toBe(expected.count);
      expect((await out.read()).slice(0, expected.count)).toStrictEqual(expected.values);
      expect((await lengths.read()).slice(0, expected.count)).toStrictEqual(expected.lengths);
    }
    plan.destroy();
  });
});

describe('default equality of floats on a real device', () => {
  gpuIt('treats -0 and +0 as equal and every NaN as a run of its own', async ({ root }) => {
    const input = [NaN, NaN, 0, -0, 1, 1];
    const buffer = root.createBuffer(d.arrayOf(d.f32, input.length), input).$usage('storage');
    const out = root.createBuffer(d.arrayOf(d.f32, input.length)).$usage('storage');
    const plan = createUnique(root, buffer, { out });
    plan.run();
    expect(await plan.countBuffer.read()).toBe(4);
    expect((await out.read()).slice(0, 4)).toStrictEqual([NaN, NaN, 0, 1]);
    plan.destroy();
  });
});

describe('compaction of matrices on a real device', () => {
  gpuIt('partition by determinant, 3000 elements', async ({ root }) => {
    const next = lcg(5);
    const input = Array.from({ length: 3000 }, () =>
      d.mat2x2f(next() % 5, next() % 5, next() % 5, next() % 5),
    );
    const matrixKind: Kind<d.m2x2f> = {
      schema: d.mat2x2f,
      predicate: (m) => {
        'use gpu';
        return std.determinant(m) > 0;
      },
      keepOnCpu: (m) => m.columns[0].x * m.columns[1].y - m.columns[1].x * m.columns[0].y > 0,
      equalOnCpu: () => false,
      make: () => d.mat2x2f(),
    };
    await check(root, matrixKind, 'partition', input);
  });
});
