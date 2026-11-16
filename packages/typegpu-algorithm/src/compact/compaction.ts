import { d, std, type StorageFlag, type TgpuBuffer, type TgpuRoot } from 'typegpu';
import { decomposeWorkgroups } from '../dispatch.ts';
import { type DispatchStep, stepRunner } from '../runPass.ts';
import { prepareScanSteps } from '../scan/prefixScan.ts';
import type { RunOptions } from '../types.ts';
import {
  type CompactionKind,
  makeCompactionSchemas,
  makeFlagKernel,
  makeKeepFn,
  makeRunLengthKernel,
  makeScatterKernel,
  WORKGROUP_SIZE,
} from './kernels.ts';

export type CompactBuffer<TElement extends d.AnyWgslData = d.AnyWgslData> = TgpuBuffer<
  d.WgslArray<TElement>
> &
  StorageFlag;

export type CountBuffer = TgpuBuffer<d.U32> & StorageFlag;

interface CountOptions {
  /**
   * Receives the number of selected elements (or runs) on every run. Created and owned by the
   * plan when not given
   */
  countBuffer?: CountBuffer;
}

export interface SelectOptions<TElement extends d.AnyWgslData> extends CountOptions {
  /** A `'use gpu'` function deciding which elements to keep */
  predicate: (value: d.Infer<TElement>) => boolean;
  /** Receives the kept elements in their original order. Needs room for every input element */
  out: CompactBuffer<TElement>;
}

export type PartitionOptions<TElement extends d.AnyWgslData> = SelectOptions<TElement>;

export interface UniqueOptions<TElement extends d.AnyWgslData> extends CountOptions {
  /**
   * A `'use gpu'` function telling whether two neighbouring elements belong to the same run.
   * Defaults to `==` for scalars and to `std.allEq` for vectors
   */
  equal?: (a: d.Infer<TElement>, b: d.Infer<TElement>) => boolean;
  /** Receives the first element of every run. Needs room for every input element */
  out: CompactBuffer<TElement>;
}

export interface RunLengthEncodeOptions<TElement extends d.AnyWgslData> extends Omit<
  UniqueOptions<TElement>,
  'out'
> {
  out: {
    /** Receives the first element of every run. Needs room for every input element */
    values: CompactBuffer<TElement>;
    /** Receives the length of every run. Needs room for every input element */
    lengths: CompactBuffer<d.U32>;
  };
}

/**
 * A reusable plan for compacting a specific buffer. All scratch buffers and bind groups are
 * created once, so `run` only records dispatches.
 */
export interface CompactionPlan {
  /** Holds the number of selected elements (or runs) after `run`, without a readback */
  readonly countBuffer: CountBuffer;
  /** Eagerly initializes every pipeline synchronously. Calling this is optional */
  initSync(): void;
  /** Eagerly initializes every pipeline asynchronously. Calling this is optional */
  initAsync(): Promise<void>;
  /** Dispatches the compaction. Can be called repeatedly */
  run(options?: RunOptions): void;
  /** Destroys the scratch buffers owned by this plan, including a count buffer it created */
  destroy(): void;
}

const scalarEqual = (a: number, b: number) => {
  'use gpu';
  return a === b;
};

const vectorEqual = (a: d.v4f, b: d.v4f) => {
  'use gpu';
  return std.allEq(a, b);
};

function defaultEqual(elementType: d.AnyWgslData) {
  if (['f32', 'f16', 'u32', 'i32'].includes(elementType.type)) {
    return scalarEqual;
  }
  if (elementType.type.startsWith('vec')) {
    return vectorEqual;
  }
  throw new Error(`Elements of type ${elementType.type} need an \`equal\` function.`);
}

interface CompactionConfig {
  kind: CompactionKind;
  test: (...args: never[]) => boolean;
  out: CompactBuffer;
  lengths?: CompactBuffer<d.U32> | undefined;
  countBuffer?: CountBuffer | undefined;
}

/** Same memory layout, field by field: two different structs must not pass as "the same type". */
function sameLayout(a: d.AnyWgslData, b: d.AnyWgslData): boolean {
  if (a === b) {
    return true;
  }
  if (a.type !== b.type || d.sizeOf(a) !== d.sizeOf(b) || d.alignmentOf(a) !== d.alignmentOf(b)) {
    return false;
  }
  const fieldsA = (a as { propTypes?: Record<string, d.AnyWgslData> }).propTypes;
  const fieldsB = (b as { propTypes?: Record<string, d.AnyWgslData> }).propTypes;
  if (fieldsA && fieldsB) {
    const names = Object.keys(fieldsA);
    return (
      names.length === Object.keys(fieldsB).length &&
      names.every(
        (name, i) =>
          Object.keys(fieldsB)[i] === name &&
          sameLayout(fieldsA[name] as d.AnyWgslData, fieldsB[name] as d.AnyWgslData),
      )
    );
  }
  const innerA =
    (a as { elementType?: d.AnyWgslData; inner?: d.AnyWgslData }).elementType ??
    (a as { inner?: d.AnyWgslData }).inner;
  const innerB =
    (b as { elementType?: d.AnyWgslData; inner?: d.AnyWgslData }).elementType ??
    (b as { inner?: d.AnyWgslData }).inner;
  return innerA && innerB ? sameLayout(innerA, innerB) : true;
}

function prepare(root: TgpuRoot, input: CompactBuffer, config: CompactionConfig) {
  const { kind, out, lengths } = config;
  const size = input.dataType.elementCount;
  const elementType = input.dataType.elementType;

  if (size === 0) {
    throw new Error('Cannot compact an empty buffer.');
  }
  for (const [name, buffer] of [
    ['out', out],
    ['lengths', lengths],
  ] as const) {
    if (buffer && buffer.dataType.elementCount < size) {
      throw new Error(
        `The ${name} buffer (${buffer.dataType.elementCount} elements) needs room for all ${size} input elements.`,
      );
    }
  }
  if (!sameLayout(out.dataType.elementType, elementType)) {
    throw new Error('The out buffer must hold the same element type as the input buffer.');
  }
  const bound = [input, out, lengths, config.countBuffer].filter((b) => b !== undefined);
  if (new Set(bound.map((b) => b.buffer)).size !== bound.length) {
    throw new Error('The input, output and count buffers must not share memory.');
  }

  const offsets = root.createBuffer(d.arrayOf(d.u32, size + 1)).$usage('storage');
  const countBuffer = config.countBuffer ?? root.createBuffer(d.u32).$usage('storage');
  const owned: { destroy(): void }[] = [offsets];

  const scan = prepareScanSteps(root, offsets, { operation: std.add, identityElement: 0 });
  owned.push(...scan.scratch);

  const schemas = makeCompactionSchemas(elementType);
  const io = root.createBindGroup(schemas.ioLayout, { input, offsets, out, count: countBuffer });
  const lengthsGroup = lengths && root.createBindGroup(schemas.lengthsLayout, { lengths });
  const keep = makeKeepFn(schemas, kind, config.test);

  const elementDispatch = decomposeWorkgroups(Math.ceil(size / WORKGROUP_SIZE));
  const scatter = root
    .createComputePipeline({ compute: makeScatterKernel(schemas, size, kind) })
    .with(io);

  const steps: DispatchStep[] = [
    {
      pipeline: root
        .createComputePipeline({ compute: makeFlagKernel(schemas, size, keep) })
        .with(io),
      workgroups: decomposeWorkgroups(Math.ceil((size + 1) / WORKGROUP_SIZE)),
    },
    ...scan.steps,
    { pipeline: lengthsGroup ? scatter.with(lengthsGroup) : scatter, workgroups: elementDispatch },
  ];
  if (lengthsGroup) {
    steps.push({
      pipeline: root
        .createComputePipeline({ compute: makeRunLengthKernel(schemas, size) })
        .with(io)
        .with(lengthsGroup),
      workgroups: elementDispatch,
    });
  }

  const plan: CompactionPlan = {
    countBuffer,
    ...stepRunner(root.device, steps),

    destroy(): void {
      for (const buffer of owned) {
        buffer.destroy();
      }
      if (!config.countBuffer) {
        countBuffer.destroy();
      }
    },
  };

  return { plan, owned };
}

function runOnce(root: TgpuRoot, input: CompactBuffer, config: CompactionConfig): CountBuffer {
  const { plan, owned } = prepare(root, input, config);
  try {
    plan.run();
  } catch (error) {
    plan.destroy();
    throw error;
  }
  for (const buffer of owned) {
    buffer.destroy();
  }
  return plan.countBuffer;
}

function selectConfig<TElement extends d.AnyWgslData>(
  kind: CompactionKind,
  options: SelectOptions<TElement>,
): CompactionConfig {
  return {
    kind,
    test: options.predicate,
    out: options.out as CompactBuffer,
    countBuffer: options.countBuffer,
  };
}

function uniqueConfig<TElement extends d.AnyWgslData>(
  input: CompactBuffer<TElement>,
  options: UniqueOptions<TElement>,
): CompactionConfig {
  return {
    kind: 'unique',
    test: options.equal ?? defaultEqual(input.dataType.elementType),
    out: options.out as CompactBuffer,
    countBuffer: options.countBuffer,
  };
}

function runLengthConfig<TElement extends d.AnyWgslData>(
  input: CompactBuffer<TElement>,
  options: RunLengthEncodeOptions<TElement>,
): CompactionConfig {
  return {
    kind: 'runLengthEncode',
    test: options.equal ?? defaultEqual(input.dataType.elementType),
    out: options.out.values as CompactBuffer,
    lengths: options.out.lengths,
    countBuffer: options.countBuffer,
  };
}

/**
 * Creates a plan that copies the elements of `input` for which `predicate` holds into `out`,
 * keeping their order, and writes how many there were to `countBuffer`.
 */
export function createSelect<TElement extends d.AnyWgslData>(
  root: TgpuRoot,
  input: CompactBuffer<TElement>,
  options: SelectOptions<TElement>,
): CompactionPlan {
  return prepare(root, input as CompactBuffer, selectConfig('select', options)).plan;
}

/**
 * Creates a plan that writes the elements of `input` for which `predicate` holds to the front of
 * `out` and the rest after them, both in their original order. `countBuffer` receives the
 * number of elements in the front part.
 */
export function createPartition<TElement extends d.AnyWgslData>(
  root: TgpuRoot,
  input: CompactBuffer<TElement>,
  options: PartitionOptions<TElement>,
): CompactionPlan {
  return prepare(root, input as CompactBuffer, selectConfig('partition', options)).plan;
}

/**
 * Creates a plan that copies the first element of every run of equal neighbours in `input` to
 * `out`, and writes the number of runs to `countBuffer`.
 */
export function createUnique<TElement extends d.AnyWgslData>(
  root: TgpuRoot,
  input: CompactBuffer<TElement>,
  options: UniqueOptions<TElement>,
): CompactionPlan {
  return prepare(root, input as CompactBuffer, uniqueConfig(input, options)).plan;
}

/**
 * Creates a plan that writes the first element and the length of every run of equal neighbours
 * in `input` to `out.values` and `out.lengths`, and the number of runs to `countBuffer`.
 */
export function createRunLengthEncode<TElement extends d.AnyWgslData>(
  root: TgpuRoot,
  input: CompactBuffer<TElement>,
  options: RunLengthEncodeOptions<TElement>,
): CompactionPlan {
  return prepare(root, input as CompactBuffer, runLengthConfig(input, options)).plan;
}

/** Selects the elements for which `predicate` holds into `out`, returning the count buffer */
export function select<TElement extends d.AnyWgslData>(
  root: TgpuRoot,
  input: CompactBuffer<TElement>,
  options: SelectOptions<TElement>,
): CountBuffer {
  return runOnce(root, input as CompactBuffer, selectConfig('select', options));
}

/** Partitions `input` by `predicate` into `out`, returning the count buffer */
export function partition<TElement extends d.AnyWgslData>(
  root: TgpuRoot,
  input: CompactBuffer<TElement>,
  options: PartitionOptions<TElement>,
): CountBuffer {
  return runOnce(root, input as CompactBuffer, selectConfig('partition', options));
}

/** Copies the first element of every run in `input` to `out`, returning the count buffer */
export function unique<TElement extends d.AnyWgslData>(
  root: TgpuRoot,
  input: CompactBuffer<TElement>,
  options: UniqueOptions<TElement>,
): CountBuffer {
  return runOnce(root, input as CompactBuffer, uniqueConfig(input, options));
}

/** Run-length encodes `input` into `out`, returning the buffer with the number of runs */
export function runLengthEncode<TElement extends d.AnyWgslData>(
  root: TgpuRoot,
  input: CompactBuffer<TElement>,
  options: RunLengthEncodeOptions<TElement>,
): CountBuffer {
  return runOnce(root, input as CompactBuffer, runLengthConfig(input, options));
}
