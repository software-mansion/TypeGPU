import type {
  StorageFlag,
  TgpuBuffer,
  TgpuComputePipeline,
  TgpuFn,
  TgpuQuerySet,
  TgpuRoot,
} from 'typegpu';
import * as d from 'typegpu/data';
import {
  type BinaryOp,
  identitySlot,
  operatorSlot,
  scanLayout,
  uniformAddLayout,
  WORKGROUP_SIZE,
} from './schemas.ts';
import { scanBlock } from './compute/scan.ts';
import { uniformOp } from './compute/applySums.ts';
import { scanGreatestBlock } from './compute/singleScan.ts';

const cache = new WeakMap<
  TgpuRoot,
  WeakMap<BinaryOp['operation'], PrefixScanComputer>
>();

class PrefixScanComputer {
  #scanPipeline?: TgpuComputePipeline;
  #reducePipeline?: TgpuComputePipeline;
  #addPipeline?: TgpuComputePipeline;

  constructor(
    private root: TgpuRoot,
    private operation: BinaryOp['operation'],
    private identityElement: BinaryOp['identityElement'],
  ) {}

  private getScanPipeline(
    onlyGreatestElement: boolean,
  ): TgpuComputePipeline {
    if (onlyGreatestElement) {
      this.#reducePipeline ??= this.root['~unstable']
        .with(operatorSlot, this.operation as TgpuFn)
        .with(identitySlot, this.identityElement)
        .withCompute(scanGreatestBlock)
        .createPipeline();
      return this.#reducePipeline;
    }

    this.#scanPipeline ??= this.root['~unstable']
      .with(operatorSlot, this.operation as TgpuFn)
      .with(identitySlot, this.identityElement)
      .withCompute(scanBlock)
      .createPipeline();
    return this.#scanPipeline;
  }

  private get addPipeline(): TgpuComputePipeline {
    this.#addPipeline ??= this.root['~unstable']
      .with(operatorSlot, this.operation as TgpuFn)
      .withCompute(uniformOp)
      .createPipeline();
    return this.#addPipeline;
  }

  private getScratchBuffer(
    size: number,
  ): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
    return this.root.createBuffer(d.arrayOf(d.f32, size)).$usage('storage');
  }

  private recursiveScan(
    buffer: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
    actualLength: number,
    onlyGreatestElement: boolean,
    querySet: TgpuQuerySet<'timestamp'> | null,
    isFirstPass: boolean,
  ): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
    const numWorkgroups = Math.ceil(actualLength / (WORKGROUP_SIZE * 8));
    const scanPipeline = this.getScanPipeline(onlyGreatestElement);

    // Base case: single workgroup
    if (numWorkgroups === 1) {
      const finalSums = this.getScratchBuffer(1);
      const bg = this.root.createBindGroup(scanLayout, {
        input: buffer,
        sums: finalSums,
      });
      let pipeline = scanPipeline.with(bg);
      if (querySet) {
        pipeline = pipeline.withTimestampWrites({
          querySet,
          ...(isFirstPass && { beginningOfPassWriteIndex: 0 }),
          endOfPassWriteIndex: 1,
        });
      }
      pipeline.dispatchWorkgroups(1);

      return onlyGreatestElement ? finalSums : buffer;
    }

    // Recursive case:
    let sumsBuffer = this.getScratchBuffer(numWorkgroups);

    const scanBg = this.root.createBindGroup(scanLayout, {
      input: buffer,
      sums: sumsBuffer,
    });
    let pipeline = scanPipeline.with(scanBg);
    if (querySet && isFirstPass) {
      pipeline = pipeline.withTimestampWrites({
        querySet,
        beginningOfPassWriteIndex: 0,
      });
    }
    pipeline.dispatchWorkgroups(numWorkgroups);

    // Recursively scan the sums
    sumsBuffer = this.recursiveScan(
      sumsBuffer,
      numWorkgroups,
      onlyGreatestElement,
      querySet,
      false,
    );

    if (onlyGreatestElement) {
      return sumsBuffer;
    }

    // Add the scanned sums back
    const addBg = this.root.createBindGroup(uniformAddLayout, {
      input: buffer,
      sums: sumsBuffer,
    });
    let addPipeline = this.addPipeline.with(addBg);
    if (querySet) {
      addPipeline = addPipeline.withTimestampWrites({
        querySet,
        endOfPassWriteIndex: 1,
      });
    }
    addPipeline.dispatchWorkgroups(numWorkgroups);
    return buffer;
  }

  compute(
    buffer: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
    onlyGreatestElement: boolean,
    querySet?: TgpuQuerySet<'timestamp'>,
  ): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
    return this.recursiveScan(
      buffer,
      buffer.dataType.elementCount,
      onlyGreatestElement,
      querySet ?? null,
      true,
    );
  }
}

/**
 * Perform a GPU prefix-scan (parallel prefix scan depending on the
 * provided operation) over the values in `inputBuffer`. For instance, this can be used to
 * compute a prefix sum over an array of numbers.
 *
 * @param root - The TypeGPU root/context used to create pipelines, bind groups and buffers.
 * @param options - Configuration object containing:
 *   - inputBuffer: A storage buffer with the input values to scan
 *   - outputBuffer: A storage buffer where the scanned values will be written
 *   - operation: The binary operation to use for the scan (e.g., std.add)
 *   - identityElement: The identity element for the operation (e.g., 0 for addition)
 * @param querySet - Optional timestamp query set (size >= 2) for GPU timing.
 *                   Index 0 gets the begin timestamp, index 1 gets the end timestamp.
 * @returns The `outputBuffer` instance which contains the scanned values.
 *
 * @example
 * ```typescript
 * const root = await tgpu.init();
 * const inputBuffer = root
 *   .createBuffer(d.arrayOf(d.f32, 4), [1, 2, 3, 4])
 *   .$usage('storage');
 * const outputBuffer = root
 *   .createBuffer(d.arrayOf(d.f32, 4))
 *   .$usage('storage');
 *
 * // using an std function
 * const result = prefixScan(
 *   root,
 *   {
 *     inputBuffer,
 *     outputBuffer,
 *     operation: std.add,
 *     identityElement: 0,
 *   },
 * );
 *
 * // using a custom tgpu.fn
 * const multiply = tgpu.fn([d.f32, d.f32], d.f32)((a, b) => a * b);
 *
 * const result = prefixScan(
 *   root,
 *   {
 *     inputBuffer,
 *     outputBuffer,
 *     operation: multiply,
 *     identityElement: 1,
 *   },
 * );
 * ```
 */
export function prefixScan(
  root: TgpuRoot,
  options: {
    inputBuffer: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
    outputBuffer: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
    operation: BinaryOp['operation'];
    identityElement: BinaryOp['identityElement'];
  },
  querySet?: TgpuQuerySet<'timestamp'>,
): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
  return runScan(root, options, false, querySet);
}

/**
 * Compute only the aggregated reduction result for `inputBuffer` using the provided operation.
 * Returns only the top-level sums/reductions instead of the full scan. This is useful when
 * you only need the final reduction - for instance, the sum of the whole array).
 *
 * @param root - The TypeGPU root/context used to create pipelines, bind groups and buffers.
 * @param options - Configuration object containing:
 *   - inputBuffer: A storage buffer with the input values to reduce
 *   - operation: The binary operation to use for the reduction (e.g., std.add)
 *   - identityElement: The identity element for the operation (e.g., 0 for addition)
 * @param querySet - Optional timestamp query set (size >= 2) for GPU timing.
 *                   Index 0 gets the begin timestamp, index 1 gets the end timestamp.
 * @returns A buffer containing the aggregated reduction result (single-element buffer).
 *
 * @example
 * ```typescript
 * const root = await tgpu.init();
 * const inputBuffer = root
 *   .createBuffer(d.arrayOf(d.f32, 4), [1, 2, 3, 4])
 *   .$usage('storage');
 *
 * // using an std function
 * const result = scan(
 *   root,
 *   {
 *     inputBuffer,
 *     operation: std.add,
 *     identityElement: 0,
 *   },
 * );
 *
 * // using a custom tgpu.fn
 * const multiply = tgpu.fn([d.f32, d.f32], d.f32)((a, b) => a * b);
 *
 * const result = scan(
 *   root,
 *   {
 *     inputBuffer,
 *     operation: multiply,
 *     identityElement: 1,
 *   },
 * );
 * ```
 */
export function scan(
  root: TgpuRoot,
  options: {
    inputBuffer: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
    operation: BinaryOp['operation'];
    identityElement: BinaryOp['identityElement'];
  },
  querySet?: TgpuQuerySet<'timestamp'>,
): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
  return runScan(root, options, true, querySet);
}

function runScan(
  root: TgpuRoot,
  options: {
    inputBuffer: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
    outputBuffer?: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
    operation: BinaryOp['operation'];
    identityElement: BinaryOp['identityElement'];
  },
  onlyGreatestElement: boolean,
  querySet?: TgpuQuerySet<'timestamp'>,
): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
  const computer = initCache(root, {
    operation: options.operation,
    identityElement: options.identityElement,
  });

  if (onlyGreatestElement) {
    return computer.compute(options.inputBuffer, true, querySet);
  }

  const outputBuffer = options.outputBuffer ?? options.inputBuffer;
  if (options.inputBuffer !== outputBuffer) {
    outputBuffer.copyFrom(options.inputBuffer);
  }

  return computer.compute(outputBuffer, false, querySet);
}

/**
 * Create or retrieve a cached `PrefixScanComputer` for the given `root` and `binaryOp`.
 *
 * @param root - The TypeGPU root/context to associate with the cached computer.
 * @param binaryOp - The binary operation used by the computer.
 * @returns A `PrefixScanComputer` instance associated with the provided `root` and `binaryOp`.
 */
export function initCache(
  root: TgpuRoot,
  binaryOp: BinaryOp,
): PrefixScanComputer {
  let rootCache = cache.get(root);
  if (!rootCache) {
    rootCache = new WeakMap();
    cache.set(root, rootCache);
  }
  let computer = rootCache.get(binaryOp.operation);
  if (!computer) {
    computer = new PrefixScanComputer(
      root,
      binaryOp.operation,
      binaryOp.identityElement,
    );
    rootCache.set(binaryOp.operation, computer);
  }
  return computer;
}

export type { BinaryOp };
