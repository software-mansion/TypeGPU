import { d } from 'typegpu';
import { buildReader, buildWriter } from 'typegpu/~internal';
import { describe, expect, it } from 'vitest';
import type { Reader, ScalarKind, Writer } from '../src/artifact.ts';
import { buildFixture } from './utils/build.ts';
import { arrayCodec } from '../src/runtime/codecs.ts';

/** The writer and reader TypeGPU generates for `schema`, as emit.ts wraps them */
function generated(schema: d.AnyWgslData): { write: Writer; read: Reader } {
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
  // oxlint-disable-next-line typescript/no-implied-eval -- as above
  const read = new Function(
    'input',
    'offset',
    'littleEndian = true',
    `return ${buildReader(schema, 'offset')};`,
  ) as Reader;
  return { write, read };
}

const cases: { kind: ScalarKind; count: number; values: number[] }[] = [
  { kind: 'f32', count: 5, values: [1.5, -2, 3.25, 0, 1e6] },
  { kind: 'f16', count: 3, values: [0.5, -1.25, 1024] },
  { kind: 'u32', count: 4, values: [0, 1, 2 ** 32 - 1, 7] },
  { kind: 'i32', count: 2, values: [-1, 2 ** 31 - 1] },
];

describe('array codecs', () => {
  it.each(cases)(
    'read and write arrays of $kind as the generated codecs do',
    ({ kind, count, values }) => {
      const schema = d.arrayOf(d[kind], count);
      const stride = d.sizeOf(d[kind]);
      const size = d.sizeOf(schema);
      const ours = arrayCodec({
        size,
        align: d.alignmentOf(schema),
        array: { element: kind, count, stride },
      });
      const theirs = generated(schema);

      const run = (write: Writer, value: unknown, offset: number, end?: number) => {
        const view = new DataView(new ArrayBuffer(size + 8));
        write(view, offset, value, true, end);
        return new Uint8Array(view.buffer);
      };
      const typed = new Uint8Array(size).map((_, i) => i * 7);
      for (const [value, offset, end] of [
        [values, 0, undefined],
        [values, 4, undefined],
        [values, 0, stride],
        [typed, 0, undefined],
        [typed, 4, size],
      ] as const) {
        expect(run(ours.write!, value, offset, end)).toStrictEqual(
          run(theirs.write, value, offset, end),
        );
      }

      const view = new DataView(new ArrayBuffer(size));
      ours.write!(view, 0, values);
      expect(ours.read!(view, 0)).toStrictEqual(theirs.read(view, 0));
    },
  );

  it('emits arrays of scalars as data', async () => {
    const bundle = await buildFixture('arrayCodecs.ts', { precompile: true });
    const { arrays } = (await import(bundle.path)) as {
      arrays: (root: object) => { Weights: { size: number; write?: Writer; read?: Reader } };
    };
    const { Weights } = arrays({ device: {} });

    expect(bundle.code).toMatch(
      /array: \{ element: "f16", count: 1e3, stride: 2 \}|array: \{ element: "f16", count: 1000, stride: 2 \}/,
    );
    expect(Weights.size).toBe(2000);
    const view = new DataView(new ArrayBuffer(Weights.size));
    Weights.write?.(view, 0, [0.5]);
    expect((Weights.read?.(view, 0) as number[])[0]).toBe(0.5);
  });
});
