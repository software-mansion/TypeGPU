import { tgpu, d, std, type TgpuRoot } from 'typegpu';
import {
  decomposeWorkgroups,
  dispatchIn,
  flatWorkgroupIndex,
  MAX_WORKGROUPS_PER_DIMENSION,
} from '../dispatch.ts';
import { type DispatchStep, stepRunner } from '../runPass.ts';
import type { RunOptions } from '../types.ts';
import { type Copy, elementConstant, type Operation } from './elementKernels.ts';
import { prepareScanSteps } from './prefixScan.ts';
import type { BinaryOp } from './types.ts';

const WORKGROUP_SIZE = 64;

export interface ChunkedScanOptions<TElement extends d.AnyWgslData> extends BinaryOp<
  d.Infer<TElement>
> {
  elementType: TElement;
  /** Number of independent sequences scanned side by side. Defaults to 1 */
  rows?: number;
  /** Number of elements in every sequence */
  length: number;
  /** Computes element `index` of sequence `row` from the caller's resources */
  element: (row: number, index: number) => d.Infer<TElement>;
  /** Receives elements `0..index` of sequence `row` combined, once per element */
  emit: (row: number, index: number, prefix: d.Infer<TElement>) => void;
  /** Number of elements one thread walks serially. Defaults to a value between 64 and 4096 */
  chunkSize?: number;
}

export interface ChunkedScanPlan {
  /** Eagerly initializes every pipeline synchronously. Calling this is optional */
  initSync(): void;
  /** Eagerly initializes every pipeline asynchronously. Calling this is optional */
  initAsync(): Promise<void>;
  /** Dispatches the scan. Can be called repeatedly */
  run(options?: RunOptions): void;
  /** Destroys the scratch buffers owned by this plan */
  destroy(): void;
}

/**
 * Creates a reusable plan for an inclusive prefix scan whose elements are computed on the fly
 * instead of being stored: a thread reduces its chunk, the chunk totals are scanned, and the
 * thread walks its chunk again from the total of everything before it. The scratch memory is
 * one element per chunk.
 *
 * Threads of one workgroup handle neighbouring rows at the same indices, so data laid out
 * as `index * rows + row` is read in order.
 */
export function createChunkedScan<TElement extends d.AnyWgslData>(
  root: TgpuRoot,
  options: ChunkedScanOptions<TElement>,
): ChunkedScanPlan {
  const elementType: d.AnyWgslData = options.elementType;
  const { length } = options;
  const rows = options.rows ?? 1;
  if (length <= 0 || rows <= 0) {
    throw new Error('Cannot scan an empty sequence.');
  }

  const requestedChunkSize =
    options.chunkSize ?? Math.min(4096, Math.max(64, length / (rows === 1 ? 4096 : 64)));
  if (!(requestedChunkSize >= 1)) {
    throw new Error('chunkSize has to be at least 1.');
  }
  const chunkSize = Math.min(length, Math.round(requestedChunkSize));
  const chunks = Math.ceil(length / chunkSize);
  const rowWorkgroups = Math.ceil(rows / WORKGROUP_SIZE);
  if (rows > 1 && Math.max(chunks, rowWorkgroups) > MAX_WORKGROUPS_PER_DIMENSION) {
    throw new Error(
      `${rows} rows of ${chunks} chunks exceed the dispatch limit, use fewer rows or a larger chunkSize.`,
    );
  }

  const op = options.operation as Operation;
  const element = options.element as (row: number, index: number) => unknown;
  const emit = options.emit as (row: number, index: number, prefix: unknown) => void;
  const copy = elementType as unknown as Copy;
  const identity = elementConstant(elementType, options.identityElement);

  const totalsBuffer = root.createBuffer(d.arrayOf(elementType, chunks * rows)).$usage('storage');
  const layout = tgpu.bindGroupLayout({
    totals: { storage: d.arrayOf(elementType), access: 'mutable' },
  });
  const totals = layout as unknown as { $: { totals: unknown[] } };

  const reduceKernel = tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(({
    lid,
    wid,
    numWorkgroups,
  }) => {
    let row = wid.x * WORKGROUP_SIZE + lid.x;
    let chunk = wid.y;
    if (rows === 1) {
      row = d.u32(0);
      chunk = flatWorkgroupIndex(wid, numWorkgroups) * WORKGROUP_SIZE + lid.x;
    }
    if (row >= d.u32(rows) || chunk >= d.u32(chunks)) {
      return;
    }

    const end = std.min((chunk + 1) * d.u32(chunkSize), d.u32(length));
    let running = copy(identity.$);
    for (let index = chunk * d.u32(chunkSize); index < end; index++) {
      running = op(running, element(row, index));
    }
    totals.$.totals[chunk * d.u32(rows) + row] = copy(running);
  });

  const scanRowsKernel = tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(({
    lid,
    wid,
    numWorkgroups,
  }) => {
    const row = flatWorkgroupIndex(wid, numWorkgroups) * WORKGROUP_SIZE + lid.x;
    if (row >= d.u32(rows)) {
      return;
    }

    let running = copy(identity.$);
    for (let chunk = d.u32(0); chunk < d.u32(chunks); chunk++) {
      const total = copy(totals.$.totals[chunk * d.u32(rows) + row]);
      totals.$.totals[chunk * d.u32(rows) + row] = copy(running);
      running = op(running, total);
    }
  });

  const walkKernel = tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(({
    lid,
    wid,
    numWorkgroups,
  }) => {
    let row = wid.x * WORKGROUP_SIZE + lid.x;
    let chunk = wid.y;
    if (rows === 1) {
      row = d.u32(0);
      chunk = flatWorkgroupIndex(wid, numWorkgroups) * WORKGROUP_SIZE + lid.x;
    }
    if (row >= d.u32(rows) || chunk >= d.u32(chunks)) {
      return;
    }

    const end = std.min((chunk + 1) * d.u32(chunkSize), d.u32(length));
    let running = copy(totals.$.totals[chunk * d.u32(rows) + row]);
    for (let index = chunk * d.u32(chunkSize); index < end; index++) {
      running = op(running, element(row, index));
      emit(row, index, running);
    }
  });

  const bindGroup = root.createBindGroup(layout, { totals: totalsBuffer });
  const chunkWorkgroups: [number, number, number] =
    rows === 1
      ? decomposeWorkgroups(Math.ceil(chunks / WORKGROUP_SIZE))
      : [rowWorkgroups, chunks, 1];

  // A single sequence can have many chunks, so their totals go through the prefix scan.
  // Rows have few chunks each, a serial loop per row is enough.
  const totalsScan =
    rows === 1
      ? prepareScanSteps(root, totalsBuffer, {
          operation: op,
          identityElement: options.identityElement,
        })
      : {
          steps: [
            {
              pipeline: root.createComputePipeline({ compute: scanRowsKernel }).with(bindGroup),
              workgroups: decomposeWorkgroups(rowWorkgroups),
            },
          ],
          scratch: [],
        };

  const steps: DispatchStep[] = [
    {
      pipeline: root.createComputePipeline({ compute: reduceKernel }).with(bindGroup),
      workgroups: chunkWorkgroups,
    },
    ...totalsScan.steps,
    {
      pipeline: root.createComputePipeline({ compute: walkKernel }).with(bindGroup),
      workgroups: chunkWorkgroups,
    },
  ];

  return {
    ...stepRunner(root.device, steps),

    destroy(): void {
      totalsBuffer.destroy();
      for (const buffer of totalsScan.scratch) {
        buffer.destroy();
      }
    },
  };
}
