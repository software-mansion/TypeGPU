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
import { BLOCK_SIZE, makeScanSchemas, type ScanElementType, type ScanSchemas } from './schemas.ts';
import type { BinaryOp } from './types.ts';

export type ScanBuffer<TElement extends ScanElementType = ScanElementType> = TgpuBuffer<
  d.WgslArray<TElement>
> &
  StorageFlag;

export interface PrefixScanOptions extends BinaryOp {
  /** Computes only the aggregate of the buffer instead of the full scan. Defaults to false */
  reduceOnly?: boolean;
}

/**
 * A reusable execution plan for scanning a specific buffer. All scratch buffers and
 * bind groups are created once, so `run` only records dispatches.
 */
export interface PrefixScanPlan<TElement extends ScanElementType = ScanElementType> {
  /**
   * The buffer holding the result after `run`. For a full prefix scan this is the scanned
   * buffer itself, for a reduction it is a single-element buffer owned by the plan.
   */
  readonly resultBuffer: ScanBuffer<TElement>;
  /** Eagerly initializes every pipeline synchronously. Calling this is optional */
  initSync(): void;
  /** Eagerly initializes every pipeline asynchronously. Calling this is optional */
  initAsync(): Promise<void>;
  /** Dispatches the scan. Can be called repeatedly */
  run(options?: RunOptions): void;
  /** Destroys the scratch buffers owned by this plan, including a reduction's result buffer */
  destroy(): void;
}

interface ScanPipelines {
  schemas: ScanSchemas;
  scan: TgpuComputePipeline;
  applySums: TgpuComputePipeline;
}

interface PlanStep {
  pipeline: TgpuComputePipeline;
  workgroups: [number, number, number];
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

const pipelineCache = new WeakMap<
  TgpuRoot,
  WeakMap<BinaryOp['operation'], Map<string, ScanPipelines>>
>();

function pipelinesFor(
  root: TgpuRoot,
  elementType: ScanElementType,
  options: PrefixScanOptions,
  reduceOnly: boolean,
): ScanPipelines {
  const { operation, identityElement } = options;
  const byOperation = getOrCreate(pipelineCache, root, () => new WeakMap());
  const byVariant = getOrCreate(byOperation, operation, () => new Map());

  return getOrCreate(byVariant, `${elementType.type}_${identityElement}_${reduceOnly}`, () => {
    const schemas = makeScanSchemas(elementType);
    return {
      schemas,
      scan: root.createComputePipeline({
        compute: makeScanKernel(schemas, operation, identityElement, reduceOnly),
      }),
      applySums: root.createComputePipeline({
        compute: makeApplySumsKernel(schemas, operation),
      }),
    };
  });
}

function prepare(root: TgpuRoot, buffer: ScanBuffer, options: PrefixScanOptions) {
  if (buffer.dataType.elementCount === 0) {
    throw new Error('Cannot scan an empty buffer.');
  }

  const reduceOnly = options.reduceOnly ?? false;
  const elementType = buffer.dataType.elementType;
  const { schemas, scan, applySums } = pipelinesFor(root, elementType, options, reduceOnly);

  const steps: PlanStep[] = [];
  const scratch: ScanBuffer[] = [];
  const applyLevels: { target: ScanBuffer; sums: ScanBuffer; numWorkgroups: number }[] = [];

  let current: ScanBuffer = buffer;
  let resultBuffer: ScanBuffer = buffer;

  for (;;) {
    const numWorkgroups = Math.ceil(current.dataType.elementCount / BLOCK_SIZE);
    const sums = root.createBuffer(d.arrayOf(elementType, numWorkgroups)).$usage('storage');
    scratch.push(sums);

    steps.push({
      pipeline: scan.with(root.createBindGroup(schemas.scanLayout, { input: current, sums })),
      workgroups: decomposeWorkgroups(numWorkgroups),
    });

    if (numWorkgroups === 1) {
      if (reduceOnly) {
        resultBuffer = sums;
      }
      break;
    }

    applyLevels.push({ target: current, sums, numWorkgroups });
    current = sums;
  }

  if (!reduceOnly) {
    for (const level of applyLevels.toReversed()) {
      steps.push({
        pipeline: applySums.with(
          root.createBindGroup(schemas.applySumsLayout, { input: level.target, sums: level.sums }),
        ),
        workgroups: decomposeWorkgroups(level.numWorkgroups),
      });
    }
  }

  const plan: PrefixScanPlan = {
    resultBuffer,

    initSync(): void {
      for (const step of steps) {
        step.pipeline.initSync();
      }
    },

    async initAsync(): Promise<void> {
      await Promise.all(steps.map((step) => step.pipeline.initAsync()));
    },

    run(runOptions?: RunOptions): void {
      const recording = beginRunPass(root.device, runOptions);
      for (const step of steps) {
        bindPass(step.pipeline, recording.pass).dispatchWorkgroups(...step.workgroups);
      }
      recording.finish();
    },

    destroy(): void {
      for (const buffer of scratch) {
        buffer.destroy();
      }
    },
  };

  return { plan, scratch };
}

/**
 * Creates a reusable plan for an exclusive prefix scan (or, with `reduceOnly`, a reduction)
 * of `buffer` in place with the given associative operation. Pipelines are shared between
 * plans created for the same `root`, `operation`, `identityElement` and element type.
 */
export function createPrefixScan<TElement extends ScanElementType>(
  root: TgpuRoot,
  buffer: ScanBuffer<TElement>,
  options: PrefixScanOptions,
): PrefixScanPlan<TElement> {
  return prepare(root, buffer as ScanBuffer, options).plan as PrefixScanPlan<TElement>;
}

/** Performs an exclusive prefix scan of `buffer` in place and returns it */
export function prefixScan<TElement extends ScanElementType>(
  root: TgpuRoot,
  buffer: ScanBuffer<TElement>,
  binaryOp: BinaryOp,
): ScanBuffer<TElement> {
  const plan = createPrefixScan(root, buffer, binaryOp);
  plan.run();
  plan.destroy();
  return buffer;
}

/**
 * Reduces `buffer` with the given associative operation, returning a single-element buffer
 * with the aggregate. The input is left untouched and the caller owns the returned buffer.
 */
export function reduce<TElement extends ScanElementType>(
  root: TgpuRoot,
  buffer: ScanBuffer<TElement>,
  binaryOp: BinaryOp,
): ScanBuffer<TElement> {
  const { plan, scratch } = prepare(root, buffer as ScanBuffer, { ...binaryOp, reduceOnly: true });
  plan.run();
  for (const scratchBuffer of scratch) {
    if (scratchBuffer !== plan.resultBuffer) {
      scratchBuffer.destroy();
    }
  }
  return plan.resultBuffer as ScanBuffer<TElement>;
}
