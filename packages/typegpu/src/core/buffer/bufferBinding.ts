import { schemaCallWrapper } from '../../data/schemaCallWrapper.ts';
import { snip } from '../../data/snippet.ts';
import type { AnyWgslData, BaseData } from '../../data/wgslTypes.ts';
import { IllegalBufferAccessError } from '../../errors.ts';
import { isInsideTgpuFn } from '../../execMode.ts';
import { type StorageFlag } from '../../extension.ts';
import { getName, setName, type TgpuNamable } from '../../shared/meta.ts';
import type { Infer, InferGPU, InferInput, InferPatch, InferPartial } from '../../shared/repr.ts';
import type { TgpuSoul } from '../../shared/soul.ts';
import { $getNameForward, $gpuValueOf, $internal, $repr, $soul } from '../../shared/symbols.ts';
import { isUsableAsStorage, isUsableAsUniform } from '../../types.ts';
import { makeDereferenceable } from '../../tgsl/makeDereferenceable.ts';
import { makeResolvable } from '../../tgsl/makeResolvable.ts';
import { type BufferWriteOptions, type TgpuBuffer, type UniformFlag } from './buffer.ts';

// ----------
// Public API
// ----------

export interface TgpuBufferBindingSoul<
  TBuffer extends TgpuBuffer<BaseData> = TgpuBuffer<BaseData>,
> extends TgpuSoul<'uniform' | 'mutable' | 'readonly'> {
  readonly buffer: TBuffer;
}

interface TgpuBufferBindingBase<TData extends BaseData> extends TgpuNamable {
  readonly [$internal]: true;
  readonly [$soul]: TgpuBufferBindingSoul<TgpuBuffer<TData>>;

  // Accessible on the CPU
  write(data: InferInput<TData>, options?: BufferWriteOptions): void;
  /** @deprecated Use {@link patch} instead. */
  writePartial(data: InferPartial<TData>): void;
  patch(data: InferPatch<TData>): void;
  read(): Promise<Infer<TData>>;
  // ---

  // Accessible on the GPU
  readonly [$gpuValueOf]: InferGPU<TData>;
  // ---

  /** Type-token, not available at runtime */
  readonly [$repr]: Infer<TData>;
}

export interface TgpuMutable<out TData extends BaseData> extends TgpuBufferBindingBase<TData> {
  readonly resourceType: 'mutable';
  readonly buffer: TgpuBuffer<TData> & StorageFlag;

  // Accessible on the GPU
  $: InferGPU<TData>;
  // ---

  /** Type-token, not available at runtime */
  readonly [$repr]: Infer<TData>;
}

export interface TgpuReadonly<out TData extends BaseData> extends TgpuBufferBindingBase<TData> {
  readonly resourceType: 'readonly';
  readonly buffer: TgpuBuffer<TData> & StorageFlag;

  // Accessible on the GPU
  readonly $: InferGPU<TData>;
  // ---

  /** Type-token, not available at runtime */
  readonly [$repr]: Infer<TData>;
}

export interface TgpuUniform<out TData extends BaseData> extends TgpuBufferBindingBase<TData> {
  readonly resourceType: 'uniform';
  readonly buffer: TgpuBuffer<TData> & UniformFlag;

  // Accessible on the GPU
  readonly $: InferGPU<TData>;
  // ---
}

export type TgpuBufferBinding<TData extends BaseData> =
  | TgpuMutable<TData>
  | TgpuReadonly<TData>
  | TgpuUniform<TData>;

export function isBufferBinding<TData extends BaseData>(
  value: unknown,
): value is TgpuBufferBinding<TData> {
  return value instanceof TgpuBufferBindingImpl;
}

export function isUniformBinding<TData extends BaseData>(
  value: unknown,
): value is TgpuUniform<TData> {
  return isBufferBinding(value) && value.resourceType === 'uniform';
}

export function isMutableBinding<TData extends BaseData>(
  value: unknown,
): value is TgpuMutable<TData> {
  return isBufferBinding(value) && value.resourceType === 'mutable';
}

export function isReadonlyBinding<TData extends BaseData>(
  value: unknown,
): value is TgpuReadonly<TData> {
  return isBufferBinding(value) && value.resourceType === 'readonly';
}

// TODO(#2666) - remove this
/** @deprecated Use 'isBufferBinding' instead. */
export const isBufferShorthand = isBufferBinding;

// --------------
// Implementation
// --------------

type BoundBuffer<TType, TData extends BaseData> = TgpuBuffer<TData> &
  (TType extends 'mutable' | 'readonly' ? StorageFlag : UniformFlag);

export class TgpuBufferBindingImpl<
  TType extends 'mutable' | 'readonly' | 'uniform',
  TData extends BaseData,
> {
  /** Type-token, not available at runtime */
  declare readonly [$repr]: Infer<TData>;

  readonly [$soul]: TgpuBufferBindingSoul<BoundBuffer<TType, TData>>;
  readonly [$getNameForward]: object;
  readonly resourceType: TType;

  // prototype properties
  declare [$internal]: true;
  declare $: InferGPU<TData>;
  declare readonly [$gpuValueOf]: InferGPU<TData>;

  static {
    TgpuBufferBindingImpl.prototype[$internal] = true;

    makeDereferenceable(
      makeResolvable(TgpuBufferBindingImpl.prototype, {
        asString() {
          return `${this.resourceType}BufferBinding:${getName(this) ?? '<unnamed>'}`;
        },
        resolve(ctx) {
          const dataType = this.buffer.dataType;
          const id = ctx.makeUniqueIdentifier(getName(this), 'global');
          const { group, binding } = ctx.allocateFixedEntry(
            this.resourceType === 'uniform'
              ? { uniform: dataType }
              : { storage: dataType, access: this.resourceType },
            this.buffer,
          );

          return ctx.gen.declareGlobalVar({
            group,
            binding,
            scope: this.resourceType,
            id,
            dataType,
            init: undefined,
          });
        },
      }),
      {
        codegenMode: {
          getBaseSnippet(trackingProxy) {
            return snip(
              trackingProxy,
              this.buffer.dataType,
              /* origin */ this.resourceType,
              /* possibleSideEffects */ false,
            );
          },
        },
        simulateMode: {
          get(state) {
            if (!state.buffers.has(this.buffer)) {
              // Not initialized yet
              state.buffers.set(
                this.buffer,
                schemaCallWrapper(this.buffer.dataType, this.buffer.initial),
              );
            }
            return state.buffers.get(this.buffer);
          },
          set(state, value) {
            state.buffers.set(this.buffer, value);
          },
        },
        normalMode: {
          get() {
            throw new IllegalBufferAccessError(
              isInsideTgpuFn()
                ? `Cannot access ${String(
                    this.buffer,
                  )}. TypeGPU functions that depends on GPU resources need to be part of a compute dispatch, draw call or simulation`
                : '.$ is inaccessible during normal JS execution. Try `.read()`',
            );
          },
          set() {
            throw new IllegalBufferAccessError(
              isInsideTgpuFn()
                ? `Cannot access ${String(
                    this.buffer,
                  )}. TypeGPU functions that depends on GPU resources need to be part of a compute dispatch, draw call or simulation`
                : '.$ is inaccessible during normal JS execution. Try `.write()`',
            );
          },
        },
      },
    );
  }

  constructor(usage: TType, buffer: BoundBuffer<TType, TData>) {
    this.resourceType = usage;
    this[$getNameForward] = buffer;
    this[$soul] = {
      type: usage,
      buffer,
      label: undefined,
    };
  }

  get buffer(): BoundBuffer<TType, TData> {
    return this[$soul].buffer;
  }

  $name(label: string): this {
    setName(this, label);
    return this;
  }

  write(data: InferInput<TData>, options?: BufferWriteOptions): void {
    this.buffer.write(data, options);
  }

  /** @deprecated Use {@link patch} instead. */
  writePartial(data: InferPartial<TData>): void {
    this.buffer.writePartial(data);
  }

  patch(data: InferPatch<TData>): void {
    this.buffer.patch(data);
  }

  read(): Promise<Infer<TData>> {
    return this.buffer.read();
  }
}

// --------------
// Constructors
// --------------

const mutableUsageMap = new WeakMap<
  TgpuBuffer<BaseData>,
  TgpuBufferBindingImpl<'mutable', BaseData>
>();

export function mutable<TData extends AnyWgslData>(
  buffer: TgpuBuffer<TData> & StorageFlag,
): TgpuMutable<TData> {
  if (!isUsableAsStorage(buffer)) {
    throw new Error(
      `Cannot call as('mutable') on ${buffer}, as it is not allowed to be used as storage. To allow it, call .$usage('storage') when creating the buffer.`,
    );
  }

  let usage = mutableUsageMap.get(buffer);
  if (!usage) {
    usage = new TgpuBufferBindingImpl('mutable', buffer);
    mutableUsageMap.set(buffer, usage);
  }
  return usage as unknown as TgpuMutable<TData>;
}

const readonlyUsageMap = new WeakMap<
  TgpuBuffer<BaseData>,
  TgpuBufferBindingImpl<'readonly', BaseData>
>();

export function readonly<TData extends AnyWgslData>(
  buffer: TgpuBuffer<TData> & StorageFlag,
): TgpuReadonly<TData> {
  if (!isUsableAsStorage(buffer)) {
    throw new Error(
      `Cannot call as('readonly') on ${buffer}, as it is not allowed to be used as storage. To allow it, call .$usage('storage') when creating the buffer.`,
    );
  }

  let usage = readonlyUsageMap.get(buffer);
  if (!usage) {
    usage = new TgpuBufferBindingImpl('readonly', buffer);
    readonlyUsageMap.set(buffer, usage);
  }
  return usage as unknown as TgpuReadonly<TData>;
}

const uniformUsageMap = new WeakMap<
  TgpuBuffer<BaseData>,
  TgpuBufferBindingImpl<'uniform', BaseData>
>();

export function uniform<TData extends AnyWgslData>(
  buffer: TgpuBuffer<TData> & UniformFlag,
): TgpuUniform<TData> {
  if (!isUsableAsUniform(buffer)) {
    throw new Error(
      `Cannot call as('uniform') on ${buffer}, as it is not allowed to be used as a uniform. To allow it, call .$usage('uniform') when creating the buffer.`,
    );
  }

  let usage = uniformUsageMap.get(buffer);
  if (!usage) {
    usage = new TgpuBufferBindingImpl('uniform', buffer);
    uniformUsageMap.set(buffer, usage);
  }
  return usage as unknown as TgpuUniform<TData>;
}
