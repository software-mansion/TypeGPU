import { d } from 'typegpu';
import { buildReader, buildWriter } from 'typegpu/~internal';
import { describe, expect, it } from 'vitest';
import type { Codec, Reader, SchemaArtifact, Writer } from '../src/artifact.ts';
import { buildFixture } from './utils/build.ts';
import { capture } from '../src/capture.ts';

/** The writer and reader TypeGPU generates for `schema`, as emit.ts wraps them */
function generated(schema: d.AnyData): { write: Writer; read: Reader | undefined } {
  const full = buildWriter(schema, 'offset', 'value', 0, false);
  const partial = buildWriter(schema, 'offset', 'value', 0, true);
  // oxlint-disable-next-line typescript/no-implied-eval -- the same code emit.ts puts in the bundle
  const write = new Function(
    'output',
    'offset',
    'value',
    'littleEndian = true',
    'endOffset = output.byteLength',
    `if (offset > 0 || endOffset < output.byteLength) {\n${partial}} else {\n${full}}`,
  ) as Writer;
  let read: Reader | undefined;
  try {
    // oxlint-disable-next-line typescript/no-implied-eval -- as above
    read = new Function(
      'input',
      'offset',
      'littleEndian = true',
      `return ${buildReader(schema, 'offset')};`,
    ) as Reader;
  } catch {
    // TypeGPU has no generated readers for disarrays
  }
  return { write, read };
}

// The same schemas as in the fixture, in TypeGPU
const Particle = d.struct({ position: d.vec2f, velocity: d.vec3f, mass: d.f16 });
const PackedParticle = d.unstruct({ id: d.u32, position: d.float32x3 });
const dev = {
  Floats: d.arrayOf(d.f32),
  Halves: d.arrayOf(d.f16),
  Particles: d.arrayOf(Particle),
  Rows: d.arrayOf(d.arrayOf(d.u32, 3)),
  Packed: d.disarrayOf(d.vec3f),
  PackedParticles: d.disarrayOf(PackedParticle),
};
type Key = keyof typeof dev;

const values: Record<Key, (i: number) => unknown> = {
  Floats: (i) => i * 1.5,
  Halves: (i) => i / 4,
  Particles: (i) => ({ position: [i, -i], velocity: [1, 2, i], mass: i + 0.5 }),
  Rows: (i) => [i, i + 1, i + 2],
  Packed: (i) => [i, 2 * i, 3 * i],
  PackedParticles: (i) => ({ id: i, position: [i, 0, -i] }),
};

describe('runtime-sized arrays', async () => {
  const bundle = await buildFixture('runtimeArrays.ts', { precompile: true });
  const { arrays } = (await import(bundle.path)) as {
    arrays: (root: object) => Record<Key, (length: number) => Codec>;
  };
  const pruned = arrays({ device: {} });

  it.each(Object.keys(dev) as Key[])(
    '%s: is called with a length, and writes and reads it as TypeGPU does',
    (key) => {
      // Of no elements, a runtime-sized array TypeGPU has no writer for, but the same layout
      expect(pruned[key](0)).toMatchObject({ size: 0, align: d.alignmentOf(dev[key](0)) });
      for (const length of [1, 3]) {
        const schema = dev[key](length);
        const ours = pruned[key](length);
        const theirs = generated(schema);
        const size = d.sizeOf(schema);
        expect(ours.size).toBe(size);
        expect(ours.align).toBe(d.alignmentOf(schema));

        const value = Array.from({ length }, (_, i) => values[key](i + 1));
        const run = (write: Writer, offset: number, end?: number) => {
          const view = new DataView(new ArrayBuffer(size + 16));
          write(view, offset, value, true, end);
          return new Uint8Array(view.buffer);
        };
        for (const [offset, end] of [
          [0, undefined],
          [4, undefined],
          [0, Math.floor(size / 2)],
        ] as const) {
          expect(run(ours.write as Writer, offset, end)).toStrictEqual(
            run(theirs.write, offset, end),
          );
        }

        if (theirs.read) {
          const view = new DataView(new ArrayBuffer(size));
          theirs.write(view, 0, value);
          expect(ours.read?.(view, 0)).toStrictEqual(theirs.read(view, 0));
        }
      }
    },
  );

  it('gives the same codec for the same length', () => {
    expect(pruned.Particles(4)).toBe(pruned.Particles(4));
    expect(() => pruned.Floats(-1)).toThrow(/invalid element count/);
  });

  it('captures them as runtime-sized array schemas', async () => {
    const { artifact } = await capture(() => dev);
    const { entries } = artifact.surface as {
      entries: Record<string, { kind: string; id: number }>;
    };
    expect(entries.Particles?.kind).toBe('arrayOf');
    expect(artifact.schemas[entries.Particles?.id ?? -1]).toMatchObject({
      type: 'array',
      count: 0,
      size: 0,
      stride: 32,
    } satisfies Partial<SchemaArtifact>);
    expect(artifact.schemas[entries.Packed?.id ?? -1]).toMatchObject({
      type: 'disarray',
      count: 0,
      stride: 12,
    });
  });
});
