import { tgpu, d, std } from 'typegpu';
import { dispatchIn, flatWorkgroupIndex } from '../dispatch.ts';

export const WORKGROUP_SIZE = 256;

export type CompactionKind = 'select' | 'partition' | 'unique' | 'runLengthEncode';

interface CompactionIo {
  $: { input: unknown[]; offsets: number[]; out: unknown[]; count: number };
}

export function makeCompactionSchemas(elementType: d.AnyWgslData) {
  return {
    ioLayout: tgpu.bindGroupLayout({
      input: { storage: d.arrayOf(elementType), access: 'readonly' },
      // One flag per element and a trailing 0, which the exclusive scan turns into the total.
      offsets: { storage: d.arrayOf(d.u32), access: 'mutable' },
      out: { storage: d.arrayOf(elementType), access: 'mutable' },
      count: { storage: d.u32, access: 'mutable' },
    }),
    lengthsLayout: tgpu.bindGroupLayout({
      lengths: { storage: d.arrayOf(d.u32), access: 'mutable' },
    }),
  };
}

export type CompactionSchemas = ReturnType<typeof makeCompactionSchemas>;

function elementIndex(lid: d.v3u, wid: d.v3u, numWorkgroups: d.v3u): number {
  'use gpu';
  return flatWorkgroupIndex(wid, numWorkgroups) * WORKGROUP_SIZE + lid.x;
}

export function makeKeepFn(
  schemas: CompactionSchemas,
  kind: CompactionKind,
  test: (...args: never[]) => boolean,
) {
  const io = schemas.ioLayout as unknown as CompactionIo;
  const predicate = test as (value: unknown) => boolean;
  const equal = test as (a: unknown, b: unknown) => boolean;

  if (kind === 'select' || kind === 'partition') {
    return (i: number) => {
      'use gpu';
      return predicate(std.copy(io.$.input[i]));
    };
  }

  return (i: number) => {
    'use gpu';
    if (i === 0) {
      return true;
    }
    return !equal(std.copy(io.$.input[i - 1]), std.copy(io.$.input[i]));
  };
}

export function makeFlagKernel(
  schemas: CompactionSchemas,
  size: number,
  keep: (i: number) => boolean,
) {
  const io = schemas.ioLayout as unknown as CompactionIo;

  return tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(
    ({ lid, wid, numWorkgroups }) => {
      const i = elementIndex(lid, wid, numWorkgroups);
      if (i < size) {
        io.$.offsets[i] = std.select(d.u32(0), d.u32(1), keep(i));
      } else if (i === size) {
        io.$.offsets[i] = 0;
      }
    },
  );
}

export function makeScatterKernel(schemas: CompactionSchemas, size: number, kind: CompactionKind) {
  const io = schemas.ioLayout as unknown as CompactionIo;
  const lengths = schemas.lengthsLayout as unknown as { $: { lengths: number[] } };
  const partition = kind === 'partition';
  const runLengths = kind === 'runLengthEncode';

  return tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(
    ({ lid, wid, numWorkgroups }) => {
      const i = elementIndex(lid, wid, numWorkgroups);
      if (i >= size) {
        return;
      }

      const offset = io.$.offsets[i] as number;
      const total = io.$.offsets[size] as number;
      if (i === 0) {
        io.$.count = total;
      }

      if (io.$.offsets[i + 1] !== offset) {
        io.$.out[offset] = std.copy(io.$.input[i]);
        if (runLengths) {
          lengths.$.lengths[offset] = i;
        }
      } else if (partition) {
        io.$.out[total + i - offset] = std.copy(io.$.input[i]);
      }
    },
  );
}

/** Turns the run starts the scatter left in `lengths` into run lengths. */
export function makeRunLengthKernel(schemas: CompactionSchemas, size: number) {
  const io = schemas.ioLayout as unknown as CompactionIo;
  const lengths = schemas.lengthsLayout as unknown as { $: { lengths: number[] } };

  return tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(
    ({ lid, wid, numWorkgroups }) => {
      const i = elementIndex(lid, wid, numWorkgroups);
      if (i >= size) {
        return;
      }

      const runsSoFar = io.$.offsets[i + 1] as number;
      if (i === size - 1 || io.$.offsets[i + 2] !== runsSoFar) {
        const run = runsSoFar - 1;
        lengths.$.lengths[run] = i + 1 - (lengths.$.lengths[run] as number);
      }
    },
  );
}
