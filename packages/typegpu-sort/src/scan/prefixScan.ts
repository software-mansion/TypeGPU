import {
  d,
  type StorageFlag,
  type TgpuBuffer,
  type TgpuComputePipeline,
  type TgpuRoot,
} from 'typegpu';
import { decomposeWorkgroups } from '../bitonic/utils.ts';
import { beginRunPass, type RunPassOptions } from '../runPass.ts';
import { makeUniformOp } from './compute/applySums.ts';
import { makeComputeBlock } from './compute/scan.ts';
import {
  ELEMENTS_PER_THREAD,
  makeScanSchemas,
  type ScanElementType,
  type ScanSchemas,
  WORKGROUP_SIZE,
} from './schemas.ts';
import type { BinaryOp } from './types.ts';

export type ScanBuffer<TElement extends ScanElementType = d.F32> = TgpuBuffer<
  d.WgslArray<TElement>
> &
  StorageFlag;

type AnyScanBuffer = TgpuBuffer<d.WgslArray<ScanElementType>> & StorageFlag;

const BLOCK_SIZE = WORKGROUP_SIZE * ELEMENTS_PER_THREAD;

const cache = new WeakMap<
  TgpuRoot,
  WeakMap<BinaryOp['operation'], Map<string, PrefixScanComputer<ScanElementType>>>
>();

interface PlanStep {
  pipeline: TgpuComputePipeline;
  workgroups: [number, number, number];
}

export type ScanRunOptions = RunPassOptions;

/**
 * A reusable execution plan for scanning a specific buffer. All scratch buffers and
 * bind groups are created once at `prepare` time, so `run` only records dispatches.
 */
export interface PrefixScanPlan<TElement extends ScanElementType = d.F32> {
  /**
   * The buffer holding the result after `run`. For a full prefix scan this is the scanned
   * buffer itself, for a reduction it is a single-element buffer owned by the plan and
   * reused across runs.
   */
  readonly resultBuffer: ScanBuffer<TElement>;
  /** Dispatches the scan. Can be called repeatedly */
  run(options?: ScanRunOptions): void;
  /** Destroys the scratch buffers owned by this plan */
  destroy(): void;
}

export class PrefixScanComputer<TElement extends ScanElementType = d.F32> {
  readonly #root: TgpuRoot;
  readonly #operation: BinaryOp['operation'];
  readonly #identityElement: BinaryOp['identityElement'];
  readonly #schemas: ScanSchemas;
  readonly #computeBlock: ReturnType<typeof makeComputeBlock>;
  readonly #uniformOp: ReturnType<typeof makeUniformOp>;
  readonly #plans = new WeakMap<
    ScanBuffer<TElement>,
    { scan?: PrefixScanPlan<TElement>; reduce?: PrefixScanPlan<TElement> }
  >();

  #scanPipeline?: TgpuComputePipeline;
  #reducePipeline?: TgpuComputePipeline;
  #opPipeline?: TgpuComputePipeline;

  constructor(
    root: TgpuRoot,
    operation: BinaryOp['operation'],
    identityElement: BinaryOp['identityElement'],
    elementType: TElement,
  ) {
    this.#root = root;
    this.#operation = operation;
    this.#identityElement = identityElement;
    this.#schemas = makeScanSchemas(elementType);
    this.#computeBlock = makeComputeBlock(this.#schemas);
    this.#uniformOp = makeUniformOp(this.#schemas);
  }

  private getScanPipeline(onlyGreatestElement: boolean): TgpuComputePipeline {
    const cached = onlyGreatestElement ? this.#reducePipeline : this.#scanPipeline;
    if (cached) {
      return cached;
    }

    const pipeline = this.#root
      .with(this.#schemas.operatorSlot, this.#operation)
      .with(this.#schemas.identitySlot, this.#identityElement)
      .with(this.#schemas.onlyGreatestElementSlot, onlyGreatestElement)
      .createComputePipeline({ compute: this.#computeBlock });

    if (onlyGreatestElement) {
      this.#reducePipeline = pipeline;
    } else {
      this.#scanPipeline = pipeline;
    }
    return pipeline;
  }

  private get opPipeline(): TgpuComputePipeline {
    this.#opPipeline ??= this.#root
      .with(this.#schemas.operatorSlot, this.#operation)
      .createComputePipeline({ compute: this.#uniformOp });
    return this.#opPipeline;
  }

  private createScratchBuffer(size: number): ScanBuffer<TElement> {
    return this.#root
      .createBuffer(d.arrayOf(this.#schemas.elementType, size))
      .$usage('storage') as ScanBuffer<TElement>;
  }

  /**
   * Creates a reusable execution plan for scanning `buffer`. All scratch buffers, bind
   * groups and pipelines are allocated up front, so `plan.run()` only records dispatches.
   */
  prepare(
    buffer: ScanBuffer<TElement>,
    options?: { onlyGreatestElement?: boolean },
  ): PrefixScanPlan<TElement> {
    const onlyGreatestElement = options?.onlyGreatestElement ?? false;
    const scanPipeline = this.getScanPipeline(onlyGreatestElement);

    const steps: PlanStep[] = [];
    const scratchBuffers: ScanBuffer<TElement>[] = [];
    const applyLevels: {
      target: ScanBuffer<TElement>;
      sums: ScanBuffer<TElement>;
      numWorkgroups: number;
    }[] = [];

    let currentBuffer = buffer;
    let currentLength = buffer.dataType.elementCount;
    let resultBuffer = buffer;

    if (currentLength === 0) {
      throw new Error('Cannot scan an empty buffer.');
    }

    for (;;) {
      const numWorkgroups = Math.ceil(currentLength / BLOCK_SIZE);
      const sumsBuffer = this.createScratchBuffer(numWorkgroups === 1 ? 1 : numWorkgroups);
      scratchBuffers.push(sumsBuffer);

      const bindGroup = this.#root.createBindGroup(this.#schemas.scanLayout, {
        input: currentBuffer as AnyScanBuffer,
        sums: sumsBuffer as AnyScanBuffer,
      });
      steps.push({
        pipeline: scanPipeline.with(bindGroup),
        workgroups: decomposeWorkgroups(numWorkgroups),
      });

      if (numWorkgroups === 1) {
        if (onlyGreatestElement) {
          resultBuffer = sumsBuffer;
        }
        break;
      }

      applyLevels.push({ target: currentBuffer, sums: sumsBuffer, numWorkgroups });
      currentBuffer = sumsBuffer;
      currentLength = numWorkgroups;
    }

    if (!onlyGreatestElement) {
      for (let i = applyLevels.length - 1; i >= 0; i--) {
        const level = applyLevels[i] as (typeof applyLevels)[number];
        const bindGroup = this.#root.createBindGroup(this.#schemas.uniformOpLayout, {
          input: level.target as AnyScanBuffer,
          sums: level.sums as AnyScanBuffer,
        });
        steps.push({
          pipeline: this.opPipeline.with(bindGroup),
          workgroups: decomposeWorkgroups(level.numWorkgroups),
        });
      }
    }

    const device = this.#root.device;

    return {
      resultBuffer,
      run(options?: ScanRunOptions) {
        const recording = beginRunPass(device, options);
        for (const step of steps) {
          step.pipeline.with(recording.pass).dispatchWorkgroups(...step.workgroups);
        }
        recording.finish();
      },
      destroy() {
        for (const scratch of scratchBuffers) {
          scratch.destroy();
        }
      },
    };
  }

  /**
   * Scans `buffer` in place, or reduces it when `onlyGreatestElement` is true. Plans are
   * cached per buffer, so repeated calls on the same buffer reuse all scratch buffers and
   * bind groups. For reductions this means the returned single-element buffer is shared
   * between calls on the same input buffer.
   */
  compute(
    buffer: ScanBuffer<TElement>,
    onlyGreatestElement: boolean,
    options?: ScanRunOptions,
  ): ScanBuffer<TElement> {
    let plans = this.#plans.get(buffer);
    if (!plans) {
      plans = {};
      this.#plans.set(buffer, plans);
    }

    const key = onlyGreatestElement ? 'reduce' : 'scan';
    let plan = plans[key];
    if (!plan) {
      plan = this.prepare(buffer, { onlyGreatestElement });
      plans[key] = plan;
    }

    plan.run(options);
    return plan.resultBuffer;
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
 *   - outputBuffer: (optional) A storage buffer where the scanned values will be written.
 *                   Defaults to in-place (overwrites `inputBuffer`).
 *   - operation: The binary operation to use for the scan (e.g., std.add)
 *   - identityElement: The identity element for the operation (e.g., 0 for addition)
 * @returns The output buffer instance which contains the scanned values.
 *
 * @example
 * ```typescript
 * const root = await tgpu.init();
 * const inputBuffer = root
 *   .createBuffer(d.arrayOf(d.f32, 4), [1, 2, 3, 4])
 *   .$usage('storage');
 *
 * // in-place (inputBuffer is modified)
 * const result = prefixScan(
 *   root,
 *   {
 *     inputBuffer,
 *     operation: std.add,
 *     identityElement: 0,
 *   },
 * );
 *
 * // with separate output buffer
 * const outputBuffer = root
 *   .createBuffer(d.arrayOf(d.f32, 4))
 *   .$usage('storage');
 *
 * const result = prefixScan(
 *   root,
 *   {
 *     inputBuffer,
 *     outputBuffer,
 *     operation: std.add,
 *     identityElement: 0,
 *   },
 * );
 * ```
 */
export function prefixScan<TElement extends ScanElementType = d.F32>(
  root: TgpuRoot,
  options: {
    inputBuffer: ScanBuffer<TElement>;
    outputBuffer?: ScanBuffer<TElement>;
    operation: BinaryOp['operation'];
    identityElement: BinaryOp['identityElement'];
  },
): ScanBuffer<TElement> {
  return runScan(root, options, false);
}

/**
 * Compute only the aggregated reduction result for `inputBuffer` using the provided operation.
 * Returns only the top-level sums/reductions instead of the full scan. This is useful when
 * you only need the final reduction - for instance, the sum of the whole array.
 *
 * @param root - The TypeGPU root/context used to create pipelines, bind groups and buffers.
 * @param options - Configuration object containing:
 *   - inputBuffer: A storage buffer with the input values to reduce
 *   - operation: The binary operation to use for the reduction (e.g., std.add)
 *   - identityElement: The identity element for the operation (e.g., 0 for addition)
 * @returns A buffer containing the aggregated reduction result (single-element buffer).
 *          It is owned by the internally cached scan plan and reused by subsequent
 *          `scan` calls on the same input buffer.
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
export function scan<TElement extends ScanElementType = d.F32>(
  root: TgpuRoot,
  options: {
    inputBuffer: ScanBuffer<TElement>;
    operation: BinaryOp['operation'];
    identityElement: BinaryOp['identityElement'];
  },
): ScanBuffer<TElement> {
  return runScan(root, options, true);
}

function runScan<TElement extends ScanElementType>(
  root: TgpuRoot,
  options: {
    inputBuffer: ScanBuffer<TElement>;
    outputBuffer?: ScanBuffer<TElement>;
    operation: BinaryOp['operation'];
    identityElement: BinaryOp['identityElement'];
  },
  onlyGreatestElement: boolean,
): ScanBuffer<TElement> {
  const elementType = options.inputBuffer.dataType.elementType;
  const computer = createPrefixScanComputer(root, {
    operation: options.operation,
    identityElement: options.identityElement,
    dataType: elementType,
  });

  if (onlyGreatestElement) {
    return computer.compute(options.inputBuffer, true);
  }

  const outputBuffer = options.outputBuffer ?? options.inputBuffer;
  if (options.inputBuffer !== outputBuffer) {
    if (
      outputBuffer.dataType.elementType.type !== elementType.type ||
      outputBuffer.dataType.elementCount !== options.inputBuffer.dataType.elementCount
    ) {
      throw new Error('The input and output scan buffers must have the same type and length.');
    }
    (outputBuffer as ScanBuffer).copyFrom(options.inputBuffer as ScanBuffer);
  }

  return computer.compute(outputBuffer, false);
}

/**
 * Create or retrieve a cached `PrefixScanComputer` for the given `root` and `binaryOp`.
 *
 * @param root - The TypeGPU root/context to associate with the cached computer.
 * @param binaryOp - The binary operation used by the computer. Set `dataType` to `d.u32`
 *                   or `d.i32` to scan integer buffers (defaults to `d.f32`).
 * @returns A `PrefixScanComputer` instance associated with the provided `root` and `binaryOp`.
 */
export function createPrefixScanComputer<TElement extends ScanElementType = d.F32>(
  root: TgpuRoot,
  binaryOp: BinaryOp<TElement>,
): PrefixScanComputer<TElement> {
  const elementType = (binaryOp.dataType ?? d.f32) as TElement;
  const cacheKey = `${binaryOp.identityElement}_${elementType.type}`;

  let rootCache = cache.get(root);
  if (!rootCache) {
    rootCache = new WeakMap();
    cache.set(root, rootCache);
  }

  let opCache = rootCache.get(binaryOp.operation);
  if (!opCache) {
    opCache = new Map();
    rootCache.set(binaryOp.operation, opCache);
  }

  let computer = opCache.get(cacheKey);
  if (!computer) {
    computer = new PrefixScanComputer(
      root,
      binaryOp.operation,
      binaryOp.identityElement,
      elementType,
    );
    opCache.set(cacheKey, computer);
  }
  return computer as PrefixScanComputer<TElement>;
}
