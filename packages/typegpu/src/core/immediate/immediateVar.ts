import { writeToArrayBuffer } from '../../data/dataIO.ts';
import { undecorate } from '../../data/dataTypes.ts';
import { sizeOf } from '../../data/sizeOf.ts';
import { snip } from '../../data/snippet.ts';
import {
  type AnyWgslData,
  type BaseData,
  isAtomic,
  isBool,
  isWgslArray,
  isWgslStruct,
} from '../../data/wgslTypes.ts';
import { IllegalVarAccessError, MissingImmediatesError } from '../../errors.ts';
import { isInsideTgpuFn } from '../../execMode.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { InferGPU, InferInput } from '../../shared/repr.ts';
import type { TgpuSoul } from '../../shared/soul.ts';
import { $gpuValueOf, $internal, $soul } from '../../shared/symbols.ts';
import { makeDereferenceable } from '../../tgsl/makeDereferenceable.ts';
import { makeResolvable } from '../../tgsl/makeResolvable.ts';
import { wgslLanguageExtensions } from '../../wgslExtensions.ts';

// ----------
// Public API
// ----------

export interface TgpuImmediateVarSoul<
  TDataType extends BaseData = BaseData,
> extends TgpuSoul<'immediate-var'> {
  readonly dataType: TDataType;
  readonly defaultValue: InferInput<TDataType> | undefined;
}

export interface TgpuImmediateVar<TDataType extends BaseData = BaseData> extends TgpuNamable {
  readonly [$internal]: true;
  readonly [$soul]: TgpuImmediateVarSoul<TDataType>;
  readonly resourceType: 'immediate-var';
  readonly dataType: TDataType;
  readonly defaultValue: InferInput<TDataType> | undefined;
  readonly [$gpuValueOf]: InferGPU<TDataType>;
  readonly $: InferGPU<TDataType>;
}

/**
 * Defines a variable in the 'immediate' address space, set from the CPU on a per-draw
 * (or per-dispatch) basis without the overhead of a buffer.
 *
 * Only one immediate variable can be used in a single shader, and its size is limited
 * by the device's `maxImmediateSize` limit. Requires the `immediate_address_space`
 * WGSL language extension, check `root.enabledWgslLanguageFeatures` for support.
 *
 * @param dataType The schema of the held data's type. Cannot contain arrays, atomics or booleans.
 * @param defaultValue The value used when no override is provided via `pipeline.with(immediate, value)`
 *                     or `pass.setImmediates`. Captured (serialized) at creation time.
 */
export function immediateVar<TDataType extends AnyWgslData>(
  dataType: TDataType,
  defaultValue?: InferInput<TDataType>,
): TgpuImmediateVar<TDataType> {
  assertValidImmediateSchema(dataType);
  return new TgpuImmediateVarImpl(dataType, defaultValue);
}

export function isImmediateVar(value: unknown): value is TgpuImmediateVar {
  return value instanceof TgpuImmediateVarImpl;
}

// --------------
// Implementation
// --------------

function assertValidImmediateSchema(schema: BaseData, rootSchema: BaseData = schema): void {
  const inner = undecorate(schema);

  if (isWgslArray(inner)) {
    throw new Error(
      `Invalid schema '${rootSchema.type}' for immediateVar: immediates cannot contain arrays (found '${inner.type}')`,
    );
  }
  if (isAtomic(inner)) {
    throw new Error(
      `Invalid schema '${rootSchema.type}' for immediateVar: immediates cannot contain atomics (found '${inner.type}')`,
    );
  }
  if (isBool(inner) || inner.type.includes('<bool>')) {
    throw new Error(
      `Invalid schema '${rootSchema.type}' for immediateVar: immediates cannot contain booleans (found '${inner.type}'), use u32 or i32 instead`,
    );
  }
  if (isWgslStruct(inner)) {
    for (const propType of Object.values(inner.propTypes)) {
      assertValidImmediateSchema(propType, rootSchema);
    }
  }
}

/**
 * Validates that the given immediate variable can be used with the given root.
 * @returns The size of the immediate data in bytes, to be passed as
 * `immediateSize` to `device.createPipelineLayout`.
 */
export function validateImmediateUsage(
  immediate: TgpuImmediateVar,
  root: { readonly enabledWgslLanguageFeatures: ReadonlySet<string> },
): number {
  if (!root.enabledWgslLanguageFeatures.has(wgslLanguageExtensions.immediateAddressSpace)) {
    throw new Error(
      `Immediate variable '${
        getName(immediate) ?? '<unnamed>'
      }' cannot be used, because the '${wgslLanguageExtensions.immediateAddressSpace}' WGSL language extension is not supported in this environment. Check support with root.enabledWgslLanguageFeatures and fall back to a uniform buffer (e.g. via tgpu.accessor) when unavailable.`,
    );
  }

  return sizeOf(immediate.dataType);
}

/**
 * An immediate value captured (serialized) at the time it was provided.
 * The `bytes` view keeps a stable identity for its lifetime; re-providing
 * a value through the same slot mutates the contents and bumps `generation`.
 */
export interface ImmediateSnapshot {
  readonly bytes: Uint8Array<ArrayBuffer>;
  generation: number;
  /** Set for snapshots referenced from pipeline priors; they are stamped into pass state by reference and must never be mutated in place */
  readonly shared: boolean;
}

export type ImmediateSnapshotMap = Map<TgpuImmediateVar, ImmediateSnapshot>;

const defaultSnapshots = new WeakMap<TgpuImmediateVar, ImmediateSnapshot>();

export function createImmediateSnapshot(
  immediate: TgpuImmediateVar,
  value: unknown,
  shared = false,
): ImmediateSnapshot {
  const bytes = new Uint8Array(sizeOf(immediate.dataType));
  writeToArrayBuffer(bytes.buffer, immediate.dataType, value);
  return { bytes, generation: 0, shared };
}

/**
 * Captures `value` into the snapshot slot for `immediate` in `map`,
 * reusing the slot's buffer when the map owns one already.
 */
export function setImmediateSnapshot(
  map: ImmediateSnapshotMap,
  immediate: TgpuImmediateVar,
  value: unknown,
): void {
  const existing = map.get(immediate);
  if (existing === undefined || existing.shared) {
    map.set(immediate, createImmediateSnapshot(immediate, value));
    return;
  }

  if (ArrayBuffer.isView(value) && value.byteLength === existing.bytes.byteLength) {
    existing.bytes.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  } else {
    writeToArrayBuffer(existing.bytes.buffer, immediate.dataType, value);
  }
  existing.generation++;
}

/**
 * Tracks the last immediate snapshot written to a pass, so that repeated
 * writes of the same captured value can be skipped. Only usable where the
 * pass's immediate state cannot be reset outside of TypeGPU's control.
 */
export interface ImmediatesCache {
  lastWrittenSnapshot: ImmediateSnapshot | undefined;
  lastWrittenGeneration: number;
}

/**
 * Sets the effective captured value of `immediate` on the given pass encoder.
 * The winner is the latest value provided to the pass, whether stamped by a
 * pipeline (`pipeline.with(immediate, value)`) or set directly (`pass.setImmediates`),
 * falling back to the variable's default value.
 *
 * When a `cache` is provided, the write is skipped if the same snapshot
 * (identity and generation) was already written.
 */
export function writeImmediates(
  pass: GPURenderPassEncoder | GPUComputePassEncoder | GPURenderBundleEncoder,
  immediate: TgpuImmediateVar,
  snapshots: ReadonlyMap<TgpuImmediateVar, ImmediateSnapshot>,
  cache?: ImmediatesCache,
): void {
  const snapshot = snapshots.get(immediate) ?? defaultSnapshots.get(immediate);

  if (snapshot === undefined) {
    throw new MissingImmediatesError(getName(immediate));
  }

  if (cache !== undefined) {
    if (
      cache.lastWrittenSnapshot === snapshot &&
      cache.lastWrittenGeneration === snapshot.generation
    ) {
      return;
    }
    cache.lastWrittenSnapshot = snapshot;
    cache.lastWrittenGeneration = snapshot.generation;
  }

  pass.setImmediates(0, snapshot.bytes.buffer);
}

class TgpuImmediateVarImpl<TDataType extends BaseData> implements TgpuImmediateVar<TDataType> {
  readonly [$soul]: TgpuImmediateVarSoul<TDataType>;

  // prototype properties
  declare readonly [$internal]: true;
  declare resourceType: 'immediate-var';
  declare readonly $: InferGPU<TDataType>;
  declare readonly [$gpuValueOf]: InferGPU<TDataType>;

  static {
    const prototype = TgpuImmediateVarImpl.prototype as TgpuImmediateVarImpl<BaseData>;

    prototype.resourceType = 'immediate-var';

    makeDereferenceable(
      makeResolvable(prototype, {
        asString() {
          return `immediateVar:${getName(this) ?? '<unnamed>'}`;
        },
        resolve(ctx) {
          ctx.registerImmediate(this);
          const id = ctx.makeUniqueIdentifier(getName(this), 'global');

          return ctx.gen.declareGlobalVar({
            scope: 'immediate',
            id,
            dataType: this[$soul].dataType,
            init: undefined,
          });
        },
      }),
      {
        codegenMode: {
          getBaseSnippet(trackingProxy) {
            return snip(
              trackingProxy,
              this[$soul].dataType,
              'immediate',
              /* possibleSideEffects */ false,
            );
          },
        },
        normalMode: {
          get() {
            throw new IllegalVarAccessError(
              isInsideTgpuFn()
                ? `Cannot access immediate variable '${getName(this) ?? '<unnamed>'}'. TypeGPU functions that depend on GPU resources need to be part of a compute dispatch or draw call`
                : 'Immediate variables are inaccessible during normal JS execution',
            );
          },
        },
      },
    );
  }

  constructor(dataType: TDataType, defaultValue?: InferInput<TDataType>) {
    this[$soul] = {
      type: 'immediate-var',
      dataType,
      defaultValue,
      label: undefined,
    };
    if (defaultValue !== undefined) {
      defaultSnapshots.set(this, createImmediateSnapshot(this, defaultValue));
    }
  }

  get dataType(): TDataType {
    return this[$soul].dataType;
  }

  get defaultValue(): InferInput<TDataType> | undefined {
    return this[$soul].defaultValue;
  }

  $name(label: string) {
    setName(this, label);
    return this;
  }
}
