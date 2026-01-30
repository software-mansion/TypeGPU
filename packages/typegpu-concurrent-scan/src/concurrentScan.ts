import type {
  StorageFlag,
  TgpuBuffer,
  TgpuComputePipeline,
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
  workgroupSize,
} from './schemas.ts';
import { scanBlock } from './compute/scan.ts';
import { uniformAdd } from './compute/applySums.ts';
import { scanGreatestBlock } from './compute/singleScan.ts';

const cache = new WeakMap<TgpuRoot, WeakMap<BinaryOp, PrefixScanComputer>>();

class PrefixScanComputer {
  #scanPipeline?: TgpuComputePipeline;
  #addPipeline?: TgpuComputePipeline;
  #querySet: TgpuQuerySet<'timestamp'> | null = null;
  #first = true;
  #timeCallback?:
    | ((timeTgpuQuery: TgpuQuerySet<'timestamp'>) => void)
    | undefined = undefined;

  constructor(
    private root: TgpuRoot,
    private binaryOp: BinaryOp,
    private onlyGreatestElement: boolean,
  ) { }

  updateTimeCallback(
    timeCallback?: (timeTgpuQuery: TgpuQuerySet<'timestamp'>) => void,
  ): void {
    this.#timeCallback = timeCallback;
    this.#querySet = this.root.createQuerySet('timestamp', 2);
  }

  private get scanPipeline(): TgpuComputePipeline {
    if (!this.#scanPipeline) {
      this.#scanPipeline = this.root['~unstable']
        .with(operatorSlot, this.binaryOp.operation as d.TgpuCallable)
        .with(identitySlot, this.binaryOp.identityElement)
        .withCompute(this.onlyGreatestElement ? scanGreatestBlock : scanBlock)
        .createPipeline();
    }
    return this.#scanPipeline;
  }

  private get addPipeline(): TgpuComputePipeline {
    if (!this.#addPipeline) {
      this.#addPipeline = this.root['~unstable']
        .with(operatorSlot, this.binaryOp.operation as d.TgpuCallable)
        .withCompute(uniformAdd)
        .createPipeline();
    }
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
    level = 0,
  ): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
    const numWorkgroups = Math.ceil(actualLength / (workgroupSize * 8));

    // Base case: single workgroup
    if (numWorkgroups === 1) {
      const finalSums = this.getScratchBuffer(1);
      const bg = this.root.createBindGroup(scanLayout, {
        input: buffer,
        sums: finalSums,
      });
      let pipeline = this.scanPipeline.with(bg);
      if (this.#timeCallback) {
        pipeline = pipeline.withTimestampWrites({
          querySet: this.#querySet as TgpuQuerySet<'timestamp'>,
          beginningOfPassWriteIndex: this.#first
            ? 0
            : (undefined as unknown as number),
          endOfPassWriteIndex: 1,
        });
      }
      pipeline.dispatchWorkgroups(1);

      if (this.onlyGreatestElement) {
        return finalSums;
      }
      return buffer;
    }
    // Recursive case:
    let sumsBuffer = this.getScratchBuffer(numWorkgroups);

    // Up-scan & Down-scan
    const scanBg = this.root.createBindGroup(scanLayout, {
      input: buffer,
      sums: sumsBuffer,
    });
    let scanPipeline = this.scanPipeline.with(scanBg);
    if (this.#timeCallback && this.#first) {
      scanPipeline = scanPipeline.withTimestampWrites({
        querySet: this.#querySet as TgpuQuerySet<'timestamp'>,
        beginningOfPassWriteIndex: 0,
      });
      this.#first = false;
    }
    scanPipeline.dispatchWorkgroups(numWorkgroups);

    // Recursively scan the sums
    sumsBuffer = this.recursiveScan(sumsBuffer, numWorkgroups, level + 1);

    if (this.onlyGreatestElement) {
      return sumsBuffer;
    }
    // Add the scanned sums back
    const addBg = this.root.createBindGroup(uniformAddLayout, {
      input: buffer,
      sums: sumsBuffer,
    });
    let addPipeline = this.addPipeline.with(addBg);
    if (this.#timeCallback) {
      addPipeline = addPipeline.withTimestampWrites({
        querySet: this.#querySet as TgpuQuerySet<'timestamp'>,
        endOfPassWriteIndex: 1,
      });
    }
    addPipeline.dispatchWorkgroups(numWorkgroups);
    return buffer;
  }

  compute(
    buffer: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
  ): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
    const result = this.recursiveScan(buffer, buffer.dataType.elementCount);

    this.#querySet?.resolve();
    if (this.#timeCallback && this.#querySet) {
      this.#timeCallback(this.#querySet);
    }
    return result;
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
 * @param timeCallback - Optional callback invoked with a timestamp `TgpuQuerySet` after the
 *                              GPU dispatch has been submitted; useful for measuring execution time.
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
  timeCallback?: (timeTgpuQuery: TgpuQuerySet<'timestamp'>) => void,
): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
  return runScan(root, options, false, timeCallback);
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
 * @param timeCallback - Optional callback invoked with a timestamp `TgpuQuerySet` after the
 *                              GPU dispatch has been submitted; useful for measuring execution time.
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
  timeCallback?: (timeTgpuQuery: TgpuQuerySet<'timestamp'>) => void,
): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
  return runScan(root, options, true, timeCallback);
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
  timeCallback?: (timeTgpuQuery: TgpuQuerySet<'timestamp'>) => void,
): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
  const binaryOp: BinaryOp = {
    operation: options.operation,
    identityElement: options.identityElement,
  };

  let computer = cache.get(root)?.get(binaryOp);
  if (!computer) {
    computer = initCache(root, binaryOp, onlyGreatestElement);
  }

  if (timeCallback) {
    (computer as PrefixScanComputer).updateTimeCallback(timeCallback);
  }

  if (onlyGreatestElement) {
    return computer.compute(options.inputBuffer);
  }

  const outputBuffer = options.outputBuffer ?? options.inputBuffer;
  if (options.inputBuffer !== outputBuffer) {
    outputBuffer.copyFrom(options.inputBuffer);
  }

  return computer.compute(outputBuffer);
}

/**
 * Create or retrieve a cached `PrefixScanComputer` for the given `root` and `binaryOp`.
 *
 * @param root - The TypeGPU root/context to associate with the cached computer.
 * @param binaryOp - The binary operation used by the computer.
 * @param onlyGreatestElement - When true, the created/retrieved computer will compute only the
 *                              top-level reduction(s) instead of the full prefix-scan.
 * @returns A `PrefixScanComputer` instance associated with the provided `root` and `binaryOp`.
 */
export function initCache(
  root: TgpuRoot,
  binaryOp: BinaryOp,
  onlyGreatestElement = false,
): PrefixScanComputer {
  let rootCache = cache.get(root);
  if (!rootCache) {
    rootCache = new WeakMap();
    cache.set(root, rootCache);
  }
  if (!rootCache.has(binaryOp)) {
    rootCache.set(
      binaryOp,
      new PrefixScanComputer(root, binaryOp, onlyGreatestElement),
    );
  }
  return rootCache.get(binaryOp) as PrefixScanComputer;
}

export type { BinaryOp };
