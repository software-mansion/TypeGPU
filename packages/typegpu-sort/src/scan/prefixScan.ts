import {
  d,
  type StorageFlag,
  type TgpuBuffer,
  type TgpuComputePipeline,
  type TgpuRoot,
} from 'typegpu';
import { decomposeWorkgroups } from '../dispatch.ts';
import { beginRunPass, bindPass } from '../runPass.ts';
import type { RunOptions } from '../types.ts';
import { makeApplySumsKernel, makeScanKernel } from './kernels.ts';
import { BLOCK_SIZE, makeScanSchemas, type ScanElementType } from './schemas.ts';
import type { BinaryOp } from './types.ts';

export type ScanBuffer<TElement extends ScanElementType = d.F32> = TgpuBuffer<
  d.WgslArray<TElement>
> &
  StorageFlag;

type AnyScanBuffer = TgpuBuffer<d.WgslArray<ScanElementType>> & StorageFlag;

interface PlanStep {
  pipeline: TgpuComputePipeline;
  workgroups: [number, number, number];
}

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
  /** Eagerly initializes every pipeline synchronously. Calling this is optional */
  initSync(): void;
  /** Eagerly initializes every pipeline asynchronously. Calling this is optional */
  initAsync(): Promise<void>;
  /** Dispatches the scan. Can be called repeatedly */
  run(options?: RunOptions): void;
  /** Destroys the scratch buffers owned by this plan */
  destroy(): void;
}

export interface PrefixScanComputer<TElement extends ScanElementType = d.F32> {
  /** Creates a reusable execution plan for scanning `buffer` */
  prepare(
    buffer: ScanBuffer<TElement>,
    options?: { reduceOnly?: boolean },
  ): PrefixScanPlan<TElement>;
  /** Scans `buffer` in place through a plan cached per buffer */
  scan(buffer: ScanBuffer<TElement>, options?: RunOptions): ScanBuffer<TElement>;
  /**
   * Reduces `buffer` through a plan cached per buffer. The returned single-element buffer
   * belongs to that plan, so it is shared between calls on the same input buffer.
   */
  reduce(buffer: ScanBuffer<TElement>, options?: RunOptions): ScanBuffer<TElement>;
}

function makeComputer<TElement extends ScanElementType>(
  root: TgpuRoot,
  operation: BinaryOp['operation'],
  identityElement: BinaryOp['identityElement'],
  elementType: TElement,
): PrefixScanComputer<TElement> {
  const schemas = makeScanSchemas(elementType);
  const scanKernel = makeScanKernel(schemas, identityElement);
  const applySumsKernel = makeApplySumsKernel(schemas);
  const withOperation = root.with(schemas.operatorSlot, operation);

  const plans = new WeakMap<
    ScanBuffer<TElement>,
    { scan?: PrefixScanPlan<TElement>; reduce?: PrefixScanPlan<TElement> }
  >();

  let scanPipeline: TgpuComputePipeline | undefined;
  let reducePipeline: TgpuComputePipeline | undefined;
  let applySumsPipeline: TgpuComputePipeline | undefined;

  function createScanPipeline(reduceOnly: boolean): TgpuComputePipeline {
    return withOperation
      .with(schemas.identitySlot, identityElement)
      .with(schemas.reduceOnlySlot, reduceOnly)
      .createComputePipeline({ compute: scanKernel });
  }

  function scanPipelineFor(reduceOnly: boolean): TgpuComputePipeline {
    if (reduceOnly) {
      reducePipeline ??= createScanPipeline(true);
      return reducePipeline;
    }
    scanPipeline ??= createScanPipeline(false);
    return scanPipeline;
  }

  function applySums(): TgpuComputePipeline {
    applySumsPipeline ??= withOperation.createComputePipeline({ compute: applySumsKernel });
    return applySumsPipeline;
  }

  function prepare(
    buffer: ScanBuffer<TElement>,
    options?: { reduceOnly?: boolean },
  ): PrefixScanPlan<TElement> {
    if (buffer.dataType.elementCount === 0) {
      throw new Error('Cannot scan an empty buffer.');
    }

    const reduceOnly = options?.reduceOnly ?? false;
    const pipeline = scanPipelineFor(reduceOnly);

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

    for (;;) {
      const numWorkgroups = Math.ceil(currentLength / BLOCK_SIZE);
      const sums = root
        .createBuffer(d.arrayOf(schemas.elementType, numWorkgroups))
        .$usage('storage') as ScanBuffer<TElement>;
      scratchBuffers.push(sums);

      steps.push({
        pipeline: pipeline.with(
          root.createBindGroup(schemas.scanLayout, {
            input: currentBuffer as AnyScanBuffer,
            sums: sums as AnyScanBuffer,
          }),
        ),
        workgroups: decomposeWorkgroups(numWorkgroups),
      });

      if (numWorkgroups === 1) {
        if (reduceOnly) {
          resultBuffer = sums;
        }
        break;
      }

      applyLevels.push({ target: currentBuffer, sums, numWorkgroups });
      currentBuffer = sums;
      currentLength = numWorkgroups;
    }

    if (!reduceOnly && applyLevels.length > 0) {
      applyLevels.reverse();
      const applyPipeline = applySums();
      for (const level of applyLevels) {
        steps.push({
          pipeline: applyPipeline.with(
            root.createBindGroup(schemas.applySumsLayout, {
              input: level.target as AnyScanBuffer,
              sums: level.sums as AnyScanBuffer,
            }),
          ),
          workgroups: decomposeWorkgroups(level.numWorkgroups),
        });
      }
    }

    return {
      resultBuffer,

      initSync(): void {
        for (const step of steps) {
          step.pipeline.initSync();
        }
      },

      async initAsync(): Promise<void> {
        await Promise.all(steps.map((step) => step.pipeline.initAsync()));
      },

      run(options?: RunOptions): void {
        const recording = beginRunPass(root.device, options);
        for (const step of steps) {
          bindPass(step.pipeline, recording.pass).dispatchWorkgroups(...step.workgroups);
        }
        recording.finish();
      },

      destroy(): void {
        for (const scratch of scratchBuffers) {
          scratch.destroy();
        }
      },
    };
  }

  function cachedPlan(buffer: ScanBuffer<TElement>, reduceOnly: boolean): PrefixScanPlan<TElement> {
    let forBuffer = plans.get(buffer);
    if (!forBuffer) {
      forBuffer = {};
      plans.set(buffer, forBuffer);
    }

    const key = reduceOnly ? 'reduce' : 'scan';
    let plan = forBuffer[key];
    if (!plan) {
      plan = prepare(buffer, { reduceOnly });
      forBuffer[key] = plan;
    }
    return plan;
  }

  return {
    prepare,

    scan(buffer, options) {
      const plan = cachedPlan(buffer, false);
      plan.run(options);
      return plan.resultBuffer;
    },

    reduce(buffer, options) {
      const plan = cachedPlan(buffer, true);
      plan.run(options);
      return plan.resultBuffer;
    },
  };
}

interface CacheLike<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): unknown;
}

function getOrCreate<K, V>(cache: CacheLike<K, V>, key: K, create: () => V): V {
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const created = create();
  cache.set(key, created);
  return created;
}

const computerCache = new WeakMap<TgpuRoot, WeakMap<BinaryOp['operation'], Map<string, unknown>>>();

/**
 * Creates a computer for the given operation, reusing the one cached for the same `root` and
 * `binaryOp` so that repeated calls share pipelines. Set `dataType` to `d.u32` or `d.i32` to
 * scan integer buffers (defaults to `d.f32`).
 */
export function createPrefixScanComputer<TElement extends ScanElementType = d.F32>(
  root: TgpuRoot,
  binaryOp: BinaryOp<TElement>,
): PrefixScanComputer<TElement> {
  const elementType = (binaryOp.dataType ?? d.f32) as TElement;
  const byOperation = getOrCreate(computerCache, root, () => new WeakMap());
  const byElement = getOrCreate(byOperation, binaryOp.operation, () => new Map());

  return getOrCreate(byElement, `${binaryOp.identityElement}_${elementType.type}`, () =>
    makeComputer(root, binaryOp.operation, binaryOp.identityElement, elementType),
  ) as PrefixScanComputer<TElement>;
}

interface ScanOptions<TElement extends ScanElementType> {
  inputBuffer: ScanBuffer<TElement>;
  operation: BinaryOp['operation'];
  identityElement: BinaryOp['identityElement'];
}

/**
 * Performs an exclusive prefix scan over `inputBuffer` with the given associative operation,
 * writing to `outputBuffer` if provided and in place otherwise.
 */
export function prefixScan<TElement extends ScanElementType = d.F32>(
  root: TgpuRoot,
  options: ScanOptions<TElement> & { outputBuffer?: ScanBuffer<TElement> },
): ScanBuffer<TElement> {
  const { inputBuffer, outputBuffer } = options;
  const computer = createPrefixScanComputer(root, {
    operation: options.operation,
    identityElement: options.identityElement,
    dataType: inputBuffer.dataType.elementType,
  });

  if (!outputBuffer || outputBuffer === inputBuffer) {
    return computer.scan(inputBuffer);
  }

  if (
    outputBuffer.dataType.elementType.type !== inputBuffer.dataType.elementType.type ||
    outputBuffer.dataType.elementCount !== inputBuffer.dataType.elementCount
  ) {
    throw new Error('The input and output scan buffers must have the same type and length.');
  }

  (outputBuffer as ScanBuffer).copyFrom(inputBuffer as ScanBuffer);
  return computer.scan(outputBuffer);
}

/**
 * Reduces `inputBuffer` with the given associative operation, returning a single-element
 * buffer with the aggregate. The input is left untouched.
 */
export function reduce<TElement extends ScanElementType = d.F32>(
  root: TgpuRoot,
  options: ScanOptions<TElement>,
): ScanBuffer<TElement> {
  return createPrefixScanComputer(root, {
    operation: options.operation,
    identityElement: options.identityElement,
    dataType: options.inputBuffer.dataType.elementType,
  }).reduce(options.inputBuffer);
}
