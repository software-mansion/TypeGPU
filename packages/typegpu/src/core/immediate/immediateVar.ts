import { writeToArrayBuffer } from '../../data/dataIO.ts';
import { undecorate } from '../../data/dataTypes.ts';
import { sizeOf } from '../../data/sizeOf.ts';
import { snip } from '../../data/snippet.ts';
import {
  type AnyWgslData,
  type BaseData,
  isBool,
  isDecorated,
  isMat,
  isNumericSchema,
  isVec,
  isVecBool,
  isWgslStruct,
} from '../../data/wgslTypes.ts';
import { IllegalVarAccessError, MissingImmediatesError } from '../../errors.ts';
import { isInsideTgpuFn } from '../../execMode.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { InferGPU, InferInput } from '../../shared/repr.ts';
import type { TgpuSoul } from '../../shared/soul.ts';
import { $gpuValueOf, $internal, $soul, isMarkedInternal } from '../../shared/symbols.ts';
import { makeDereferenceable } from '../../tgsl/makeDereferenceable.ts';
import { makeResolvable } from '../../tgsl/makeResolvable.ts';

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
  return (value as TgpuImmediateVar)?.resourceType === 'immediate-var' && isMarkedInternal(value);
}

// --------------
// Implementation
// --------------

function assertValidImmediateSchema(schema: BaseData, rootSchema: BaseData = schema): void {
  if (isWgslStruct(schema)) {
    for (const propType of Object.values(schema.propTypes)) {
      assertValidImmediateSchema(undecorate(propType), rootSchema);
    }
    return;
  }
  if (isBool(schema) || isVecBool(schema)) {
    throw new Error(
      `Invalid schema '${rootSchema.type}' for immediateVar: immediates cannot contain booleans (found '${schema.type}'), use u32 or i32 instead`,
    );
  }
  if (isDecorated(schema)) {
    throw new Error(`Invalid schema for immediateVar: immediates cannot be decorated types`);
  }
  if (!isNumericSchema(schema) && !isVec(schema) && !isMat(schema)) {
    throw new Error(
      `Invalid schema '${rootSchema.type}' for immediateVar: immediates can only hold scalars, vectors, matrices and structs of those (found '${schema.type}')`,
    );
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
  if (!root.enabledWgslLanguageFeatures.has('immediate_address_space')) {
    throw new Error(
      `Immediate variable '${
        getName(immediate) ?? '<unnamed>'
      }' cannot be used, because the 'immediate_address_space' WGSL language extension is not supported in this environment. Check support with root.enabledWgslLanguageFeatures and fall back to a uniform buffer (e.g. via tgpu.accessor) when unavailable.`,
    );
  }

  return sizeOf(immediate.dataType);
}

/** Captured bytes of an immediate value, immutable once created */
export type ImmediateSnapshot = Uint8Array<ArrayBuffer>;

const defaultSnapshots = new WeakMap<TgpuImmediateVar, ImmediateSnapshot>();

export function createImmediateSnapshot(
  immediate: TgpuImmediateVar,
  value: unknown,
): ImmediateSnapshot {
  const bytes = new Uint8Array(sizeOf(immediate.dataType));
  writeToArrayBuffer(bytes.buffer, immediate.dataType, value);
  return bytes;
}

/** Captures pass overrides and tracks the last snapshot written to its encoder. */
export class ImmediatePassState {
  readonly #snapshots = new Map<TgpuImmediateVar, ImmediateSnapshot>();
  #lastWritten: ImmediateSnapshot | undefined;

  set(immediate: TgpuImmediateVar, value: unknown): void {
    this.#snapshots.set(immediate, createImmediateSnapshot(immediate, value));
  }

  invalidate(): void {
    this.#lastWritten = undefined;
  }

  /** Pass overrides take precedence over pipeline values and the variable's default. */
  write(
    pass: GPURenderPassEncoder | GPUComputePassEncoder | GPURenderBundleEncoder,
    immediate: TgpuImmediateVar,
    pipelineSnapshots: ReadonlyMap<TgpuImmediateVar, ImmediateSnapshot> | undefined,
    deduplicate: boolean,
  ): void {
    const snapshot =
      this.#snapshots.get(immediate) ??
      pipelineSnapshots?.get(immediate) ??
      defaultSnapshots.get(immediate);

    if (snapshot === undefined) {
      throw new MissingImmediatesError(getName(immediate));
    }
    if (deduplicate && this.#lastWritten === snapshot) {
      return;
    }

    pass.setImmediates(0, snapshot.buffer);
    this.#lastWritten = snapshot;
  }
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
