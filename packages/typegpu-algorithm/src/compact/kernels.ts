import { tgpu, d, std } from 'typegpu';
import { dispatchIn, flatWorkgroupIndex } from '../dispatch.ts';

export const WORKGROUP_SIZE = 256;
/** Run lengths each thread of the run-length kernel finishes, WORKGROUP_SIZE apart */
export const RUNS_PER_THREAD = 16;

/**
 * Consecutive elements each thread owns: about 32 bytes of them, which keeps the threads of a workgroup reading
 * nearby memory, and at most 16 so that they and the next element fit one bit mask.
 */
export function itemsPerThread(elementType: d.AnyWgslData): number {
  return Math.max(1, Math.min(16, Math.floor(32 / d.sizeOf(elementType))));
}

export type CompactionKind = 'select' | 'partition' | 'unique' | 'runLengthEncode';

interface CompactionIo {
  $: { input: unknown[]; offsets: number[]; out: unknown[]; count: number };
}

interface RunLengthIo {
  $: { lengths: number[]; ends: number[] };
}

export function makeCompactionSchemas(elementType: d.AnyWgslData) {
  return {
    ioLayout: tgpu.bindGroupLayout({
      input: { storage: d.arrayOf(elementType), access: 'readonly' },
      // One count per tile and a trailing 0, which the exclusive scan turns into the total.
      offsets: { storage: d.arrayOf(d.u32), access: 'mutable' },
      out: { storage: d.arrayOf(elementType), access: 'mutable' },
      count: { storage: d.u32, access: 'mutable' },
    }),
    lengthsLayout: tgpu.bindGroupLayout({
      lengths: { storage: d.arrayOf(d.u32), access: 'mutable' },
      // One past the last element of every run.
      ends: { storage: d.arrayOf(d.u32), access: 'mutable' },
    }),
  };
}

export type CompactionSchemas = ReturnType<typeof makeCompactionSchemas>;

const threadCounts = tgpu.workgroupVar(d.arrayOf(d.u32, WORKGROUP_SIZE));

/** Exclusive sum of `value` over the threads of the workgroup. Every thread has to call it. */
function exclusiveTileSum(localIdx: number, value: number): number {
  'use gpu';
  threadCounts.$[localIdx] = value;
  for (let span = d.u32(1); span < WORKGROUP_SIZE; span <<= 1) {
    std.workgroupBarrier();
    let add = d.u32(0);
    if (localIdx >= span) {
      add = threadCounts.$[localIdx - span] as number;
    }
    std.workgroupBarrier();
    threadCounts.$[localIdx] = (threadCounts.$[localIdx] as number) + add;
  }
  return (threadCounts.$[localIdx] as number) - value;
}

export function makeKeepFn(
  schemas: CompactionSchemas,
  kind: CompactionKind,
  test: (...args: never[]) => boolean,
) {
  const io = schemas.ioLayout as unknown as CompactionIo;
  const predicate = test as (value: unknown) => boolean;
  const equal = test as (a: unknown, b: unknown) => boolean;

  const keepMatching = (i: number) => {
    'use gpu';
    return predicate(std.copy(io.$.input[i]));
  };

  const keepRunStart = (i: number) => {
    'use gpu';
    if (i === 0) {
      return true;
    }
    return !equal(std.copy(io.$.input[i - 1]), std.copy(io.$.input[i]));
  };

  return kind === 'select' || kind === 'partition' ? keepMatching : keepRunStart;
}

/**
 * Bit k is set when element `first + k` is kept. Run-length encoding also needs the element after the thread's
 * last one, in bit `items`.
 */
function makeKeptMask(
  size: number,
  items: number,
  keep: (i: number) => boolean,
  withNext: boolean,
) {
  const bits = items + (withNext ? 1 : 0);
  const keptMask = (first: number) => {
    'use gpu';
    let mask = d.u32(0);
    for (let k = d.u32(0); k < bits; k++) {
      const i = first + k;
      if (i < size && keep(i)) {
        mask = mask | (d.u32(1) << k);
      }
    }
    return mask;
  };
  return keptMask;
}

/** Writes the number of kept elements of every tile, and the trailing 0 after them. */
export function makeCountKernel(
  schemas: CompactionSchemas,
  size: number,
  items: number,
  keep: (i: number) => boolean,
) {
  const io = schemas.ioLayout as unknown as CompactionIo;
  const keptMask = makeKeptMask(size, items, keep, false);
  const tileSize = WORKGROUP_SIZE * items;
  const numTiles = Math.ceil(size / tileSize);

  return tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(
    ({ lid, wid, numWorkgroups }) => {
      const tileId = flatWorkgroupIndex(wid, numWorkgroups);
      if (tileId >= numTiles) {
        return;
      }
      const localIdx = lid.x;
      const kept = std.countOneBits(keptMask(tileId * tileSize + localIdx * items));
      const before = exclusiveTileSum(localIdx, kept);
      if (localIdx === WORKGROUP_SIZE - 1) {
        io.$.offsets[tileId] = before + kept;
      }
      if (tileId === 0 && localIdx === 0) {
        io.$.offsets[numTiles] = 0;
      }
    },
  );
}

/**
 * Recomputes every tile's kept elements and writes them to their place in `out`, after the kept elements of the
 * earlier tiles. Partition writes the rejected elements after all kept ones, run-length encoding records where
 * every run starts and ends.
 */
export function makeScatterKernel(
  schemas: CompactionSchemas,
  size: number,
  items: number,
  kind: CompactionKind,
  keep: (i: number) => boolean,
) {
  const io = schemas.ioLayout as unknown as CompactionIo;
  const runs = schemas.lengthsLayout as unknown as RunLengthIo;
  const partition = kind === 'partition';
  const runLengths = kind === 'runLengthEncode';
  const keptMask = makeKeptMask(size, items, keep, runLengths);
  const tileSize = WORKGROUP_SIZE * items;
  const numTiles = Math.ceil(size / tileSize);
  const threadBits = (1 << items) - 1;

  return tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(
    ({ lid, wid, numWorkgroups }) => {
      const tileId = flatWorkgroupIndex(wid, numWorkgroups);
      if (tileId >= numTiles) {
        return;
      }
      const localIdx = lid.x;
      const first = tileId * tileSize + localIdx * items;
      const mask = keptMask(first);
      const before = exclusiveTileSum(localIdx, std.countOneBits(mask & threadBits));

      const total = io.$.offsets[numTiles] as number;
      if (tileId === 0 && localIdx === 0) {
        io.$.count = total;
      }

      let offset = (io.$.offsets[tileId] as number) + before;
      for (let k = d.u32(0); k < items; k++) {
        const i = first + k;
        if (i < size) {
          if (((mask >>> k) & 1) === 1) {
            io.$.out[offset] = std.copy(io.$.input[i]);
            if (runLengths) {
              runs.$.lengths[offset] = i;
            }
            offset += 1;
          } else if (partition) {
            io.$.out[total + i - offset] = std.copy(io.$.input[i]);
          }
          if (runLengths) {
            if (i + 1 === size || ((mask >>> (k + 1)) & 1) === 1) {
              runs.$.ends[offset - 1] = i + 1;
            }
          }
        }
      }
    },
  );
}

/** Turns the run starts the scatter left in `lengths` into run lengths, RUNS_PER_THREAD runs per thread. */
export function makeRunLengthKernel(schemas: CompactionSchemas, numTiles: number) {
  const io = schemas.ioLayout as unknown as CompactionIo;
  const runs = schemas.lengthsLayout as unknown as RunLengthIo;

  return tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(
    ({ lid, wid, numWorkgroups }) => {
      const total = io.$.offsets[numTiles] as number;
      const first =
        flatWorkgroupIndex(wid, numWorkgroups) * WORKGROUP_SIZE * RUNS_PER_THREAD + lid.x;
      for (let k = d.u32(0); k < RUNS_PER_THREAD; k++) {
        const run = first + k * WORKGROUP_SIZE;
        if (run < total) {
          runs.$.lengths[run] = (runs.$.ends[run] as number) - (runs.$.lengths[run] as number);
        }
      }
    },
  );
}
