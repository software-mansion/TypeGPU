import {
  d,
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuBuffer,
  type TgpuComputePipeline,
  type TgpuRoot,
} from 'typegpu';
import { decomposeWorkgroups } from '../dispatch.ts';
import { type DispatchStep, stepRunner } from '../runPass.ts';
import type { RunOptions } from '../types.ts';
import {
  makeElementApplySumsKernel,
  makeElementScanKernel,
  makeElementScanSchemas,
} from './elementKernels.ts';
import { makeApplySumsKernel, makeScanKernel } from './kernels.ts';
import { BLOCK_SIZE, makeScanSchemas, type ScanElementType } from './schemas.ts';
import type { BinaryOp } from './types.ts';

export type ScanBuffer<TElement extends d.AnyWgslData = ScanElementType> = TgpuBuffer<
  d.WgslArray<TElement>
> &
  StorageFlag;

type AnyScanBuffer = ScanBuffer<d.AnyWgslData>;

interface Destroyable {
  destroy(): void;
}

export interface PrefixScanOptions<TValue = number> extends BinaryOp<TValue> {
  /** Computes only the aggregate of the buffer instead of the full scan. Defaults to false */
  reduceOnly?: boolean;
}

/**
 * A reusable execution plan for scanning a specific buffer. All scratch buffers and
 * bind groups are created once, so `run` only records dispatches.
 */
export interface PrefixScanPlan<TElement extends d.AnyWgslData = ScanElementType> {
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
  blockSize: number;
  scan: TgpuComputePipeline;
  applySums: TgpuComputePipeline;
  bindScan(input: AnyScanBuffer, sums: AnyScanBuffer): TgpuBindGroup;
  bindApplySums(input: AnyScanBuffer, sums: AnyScanBuffer): TgpuBindGroup;
  /** Buffers created by `bindScan`, for the plan to destroy */
  owned?: Destroyable[];
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

const SCALAR_TYPES = ['f32', 'u32', 'i32'];

function isScalar(elementType: d.AnyWgslData): elementType is ScanElementType {
  return SCALAR_TYPES.includes(elementType.type);
}

function scalarPipelines(
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
      blockSize: BLOCK_SIZE,
      scan: root.createComputePipeline({
        compute: makeScanKernel(schemas, operation, identityElement, reduceOnly),
      }),
      applySums: root.createComputePipeline({
        compute: makeApplySumsKernel(schemas, operation),
      }),
      bindScan: (input, sums) =>
        root.createBindGroup(schemas.scanLayout, {
          input: input as ScanBuffer,
          sums: sums as ScanBuffer,
        }),
      bindApplySums: (input, sums) =>
        root.createBindGroup(schemas.applySumsLayout, {
          input: input as ScanBuffer,
          sums: sums as ScanBuffer,
        }),
    };
  });
}

/** Vectors, matrices and structs. These pipelines are not shared between plans. */
function elementPipelines(
  root: TgpuRoot,
  elementType: d.AnyWgslData,
  options: PrefixScanOptions<unknown>,
  reduceOnly: boolean,
): ScanPipelines {
  const schemas = makeElementScanSchemas(elementType);
  const owned: Destroyable[] = [];
  return {
    owned,
    blockSize: schemas.blockSize,
    scan: root.createComputePipeline({
      compute: makeElementScanKernel(
        schemas,
        options.operation,
        options.identityElement,
        reduceOnly,
      ),
    }),
    applySums: root.createComputePipeline({
      compute: makeElementApplySumsKernel(schemas, options.operation),
    }),
    bindScan: (input, sums) => {
      const count = root.createBuffer(d.u32, input.dataType.elementCount).$usage('uniform');
      owned.push(count);
      return root.createBindGroup(schemas.scanLayout, { input, sums, count });
    },
    bindApplySums: (input, sums) => root.createBindGroup(schemas.applySumsLayout, { input, sums }),
  };
}

/** The dispatches of a scan of `buffer` in place, without a plan around them. */
export function prepareScanSteps(
  root: TgpuRoot,
  buffer: AnyScanBuffer,
  options: PrefixScanOptions<unknown>,
) {
  if (buffer.dataType.elementCount === 0) {
    throw new Error('Cannot scan an empty buffer.');
  }

  const reduceOnly = options.reduceOnly ?? false;
  const elementType = buffer.dataType.elementType;
  const pipelines = isScalar(elementType)
    ? scalarPipelines(root, elementType, options as PrefixScanOptions, reduceOnly)
    : elementPipelines(root, elementType, options, reduceOnly);

  const steps: DispatchStep[] = [];
  const scratch: Destroyable[] = [];
  const applyLevels: { target: AnyScanBuffer; sums: AnyScanBuffer; numWorkgroups: number }[] = [];

  let current = buffer;
  let resultBuffer = buffer;

  for (;;) {
    const numWorkgroups = Math.ceil(current.dataType.elementCount / pipelines.blockSize);
    const sums = root.createBuffer(d.arrayOf(elementType, numWorkgroups)).$usage('storage');
    scratch.push(sums);

    steps.push({
      pipeline: pipelines.scan.with(pipelines.bindScan(current, sums)),
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
        pipeline: pipelines.applySums.with(pipelines.bindApplySums(level.target, level.sums)),
        workgroups: decomposeWorkgroups(level.numWorkgroups),
      });
    }
  }

  scratch.push(...(pipelines.owned ?? []));

  return { steps, scratch, resultBuffer };
}

function prepare(root: TgpuRoot, buffer: AnyScanBuffer, options: PrefixScanOptions<unknown>) {
  const { steps, scratch, resultBuffer } = prepareScanSteps(root, buffer, options);

  const plan: PrefixScanPlan<d.AnyWgslData> = {
    resultBuffer,
    ...stepRunner(root.device, steps),

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
 * of `buffer` in place with the given associative operation, which need not be commutative.
 * Elements can be scalars, vectors, matrices or structs of up to 1024 bytes. Scalar pipelines
 * are shared between plans created for the same `root`, `operation`, `identityElement` and
 * element type.
 */
export function createPrefixScan<TElement extends d.AnyWgslData>(
  root: TgpuRoot,
  buffer: ScanBuffer<TElement>,
  options: PrefixScanOptions<d.Infer<TElement>>,
): PrefixScanPlan<TElement> {
  return prepare(root, buffer as AnyScanBuffer, options as PrefixScanOptions<unknown>)
    .plan as PrefixScanPlan<TElement>;
}

/** Performs an exclusive prefix scan of `buffer` in place and returns it */
export function prefixScan<TElement extends d.AnyWgslData>(
  root: TgpuRoot,
  buffer: ScanBuffer<TElement>,
  binaryOp: BinaryOp<d.Infer<TElement>>,
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
export function reduce<TElement extends d.AnyWgslData>(
  root: TgpuRoot,
  buffer: ScanBuffer<TElement>,
  binaryOp: BinaryOp<d.Infer<TElement>>,
): ScanBuffer<TElement> {
  const { plan, scratch } = prepare(root, buffer as AnyScanBuffer, {
    ...(binaryOp as BinaryOp<unknown>),
    reduceOnly: true,
  });
  plan.run();
  for (const scratchBuffer of scratch) {
    if (scratchBuffer !== plan.resultBuffer) {
      scratchBuffer.destroy();
    }
  }
  return plan.resultBuffer as ScanBuffer<TElement>;
}
