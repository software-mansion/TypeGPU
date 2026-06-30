import { schemaCallWrapper } from '../../data/schemaCallWrapper.ts';
import { snip, type ResolvedSnippet } from '../../data/snippet.ts';
import type { AnyWgslData, BaseData } from '../../data/wgslTypes.ts';
import { IllegalBufferAccessError } from '../../errors.ts';
import { getExecMode, isInsideTgpuFn } from '../../execMode.ts';
import { isUsableAsStorage, type StorageFlag } from '../../extension.ts';
import { getName, setName, type TgpuNamable } from '../../shared/meta.ts';
import type { Infer, InferGPU, InferInput, InferPatch, InferPartial } from '../../shared/repr.ts';
import {
  $getNameForward,
  $gpuValueOf,
  $internal,
  $ownSnippet,
  $repr,
  $resolve,
} from '../../shared/symbols.ts';
import { assertExhaustive } from '../../shared/utilityTypes.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';
import type { BufferWriteOptions, TgpuBuffer, UniformFlag } from './buffer.ts';
import { isUsableAsUniform } from './bufferUsage.ts';

// ----------
// Public API
// ----------

interface TgpuBufferShorthandBase<TData extends BaseData> extends TgpuNamable {
  readonly [$internal]: true;

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

export interface TgpuMutable<out TData extends BaseData> extends TgpuBufferShorthandBase<TData> {
  readonly resourceType: 'mutable';
  readonly buffer: TgpuBuffer<TData> & StorageFlag;

  // Accessible on the GPU
  /**
   * @deprecated Use `.$` instead, works the same way.
   */
  value: InferGPU<TData>;
  $: InferGPU<TData>;
  // ---

  /** Type-token, not available at runtime */
  readonly [$repr]: Infer<TData>;
}

export interface TgpuReadonly<out TData extends BaseData> extends TgpuBufferShorthandBase<TData> {
  readonly resourceType: 'readonly';
  readonly buffer: TgpuBuffer<TData> & StorageFlag;

  // Accessible on the GPU
  /**
   * @deprecated Use `.$` instead, works the same way.
   */
  readonly value: InferGPU<TData>;
  readonly $: InferGPU<TData>;
  // ---

  /** Type-token, not available at runtime */
  readonly [$repr]: Infer<TData>;
}

export interface TgpuUniform<out TData extends BaseData> extends TgpuBufferShorthandBase<TData> {
  readonly resourceType: 'uniform';
  readonly buffer: TgpuBuffer<TData> & UniformFlag;

  // Accessible on the GPU
  /**
   * @deprecated Use `.$` instead, works the same way.
   */
  readonly value: InferGPU<TData>;
  readonly $: InferGPU<TData>;
  // ---
}

export type TgpuBufferShorthand<TData extends BaseData> =
  | TgpuMutable<TData>
  | TgpuReadonly<TData>
  | TgpuUniform<TData>;

export function isBufferShorthand<TData extends BaseData>(
  value: unknown,
): value is TgpuBufferShorthand<TData> {
  return value instanceof TgpuBufferShorthandImpl;
}

// --------------
// Implementation
// --------------

export class TgpuBufferShorthandImpl<
  TType extends 'mutable' | 'readonly' | 'uniform',
  TData extends BaseData,
> implements SelfResolvable {
  /** Type-token, not available at runtime */
  declare readonly [$repr]: Infer<TData>;

  readonly [$internal] = true;
  readonly [$getNameForward]: object;
  readonly buffer: TgpuBuffer<TData> &
    (TType extends 'mutable' | 'readonly' ? StorageFlag : UniformFlag);
  readonly resourceType: TType;

  constructor(
    usage: TType,
    buffer: TgpuBuffer<TData> & (TType extends 'mutable' | 'readonly' ? StorageFlag : UniformFlag),
  ) {
    this.resourceType = usage;
    this.buffer = buffer;
    this[$getNameForward] = buffer;
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

  get [$gpuValueOf](): InferGPU<TData> {
    const dataType = this.buffer.dataType;
    const usage = this.resourceType;

    return new Proxy(
      {
        [$internal]: true,
        get [$ownSnippet]() {
          return snip(this, dataType, usage);
        },
        [$resolve]: (ctx) => ctx.resolve(this),
        toString: () => `${usage}:${getName(this) ?? '<unnamed>'}.$`,
      },
      valueProxyHandler,
    ) as InferGPU<TData>;
  }

  get $(): InferGPU<TData> {
    const mode = getExecMode();
    const insideTgpuFn = isInsideTgpuFn();

    if (mode.type === 'normal') {
      throw new IllegalBufferAccessError(
        insideTgpuFn
          ? `Cannot access ${String(
              this.buffer,
            )}. TypeGPU functions that depends on GPU resources need to be part of a compute dispatch, draw call or simulation`
          : '.$ is inaccessible during normal JS execution. Try `.read()`',
      );
    }

    if (mode.type === 'codegen') {
      return this[$gpuValueOf];
    }

    if (mode.type === 'simulate') {
      if (!mode.buffers.has(this.buffer)) {
        // Not initialized yet
        mode.buffers.set(this.buffer, schemaCallWrapper(this.buffer.dataType, this.buffer.initial));
      }
      return mode.buffers.get(this.buffer) as InferGPU<TData>;
    }

    return assertExhaustive(mode, 'bufferUsage.ts#TgpuFixedBufferImpl/$');
  }

  set $(value: InferGPU<TData>) {
    const mode = getExecMode();
    const insideTgpuFn = isInsideTgpuFn();

    if (mode.type === 'normal') {
      throw new IllegalBufferAccessError(
        insideTgpuFn
          ? `Cannot access ${String(
              this.buffer,
            )}. TypeGPU functions that depends on GPU resources need to be part of a compute dispatch, draw call or simulation`
          : '.$ is inaccessible during normal JS execution. Try `.write()`',
      );
    }

    if (mode.type === 'codegen') {
      // The WGSL generator handles buffer assignment, and does not defer to
      // whatever's being assigned to generate the WGSL.
      throw new Error('Unreachable bufferUsage.ts#TgpuFixedBufferImpl/$');
    }

    if (mode.type === 'simulate') {
      mode.buffers.set(this.buffer, value);
      return;
    }

    assertExhaustive(mode, 'bufferUsage.ts#TgpuFixedBufferImpl/$');
  }

  get value(): InferGPU<TData> {
    return this.$;
  }

  set value(value: InferGPU<TData>) {
    this.$ = value;
  }

  toString(): string {
    return `${this.resourceType}BufferShorthand:${getName(this) ?? '<unnamed>'}`;
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
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
  }
}

// --------------
// Constructors
// --------------

const mutableUsageMap = new WeakMap<
  TgpuBuffer<BaseData>,
  TgpuBufferShorthandImpl<'mutable', BaseData>
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
    usage = new TgpuBufferShorthandImpl('mutable', buffer);
    mutableUsageMap.set(buffer, usage);
  }
  return usage as unknown as TgpuMutable<TData>;
}

const readonlyUsageMap = new WeakMap<
  TgpuBuffer<BaseData>,
  TgpuBufferShorthandImpl<'readonly', BaseData>
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
    usage = new TgpuBufferShorthandImpl('readonly', buffer);
    readonlyUsageMap.set(buffer, usage);
  }
  return usage as unknown as TgpuReadonly<TData>;
}

const uniformUsageMap = new WeakMap<
  TgpuBuffer<BaseData>,
  TgpuBufferShorthandImpl<'uniform', BaseData>
>();

export function uniform<TData extends AnyWgslData>(
  buffer: TgpuBuffer<TData> & UniformFlag,
): TgpuUniform<BaseData> {
  if (!isUsableAsUniform(buffer)) {
    throw new Error(
      `Cannot call as('uniform') on ${buffer}, as it is not allowed to be used as a uniform. To allow it, call .$usage('uniform') when creating the buffer.`,
    );
  }

  let usage = uniformUsageMap.get(buffer);
  if (!usage) {
    usage = new TgpuBufferShorthandImpl('uniform', buffer);
    uniformUsageMap.set(buffer, usage);
  }
  return usage as unknown as TgpuUniform<TData>;
}
