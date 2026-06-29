import { schemaCallWrapper } from '../../data/schemaCallWrapper.ts';
import { snip, type ResolvedSnippet } from '../../data/snippet.ts';
import type { BaseData } from '../../data/wgslTypes.ts';
import { IllegalBufferAccessError } from '../../errors.ts';
import { getExecMode, isInsideTgpuFn } from '../../execMode.ts';
import type { StorageFlag } from '../../extension.ts';
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
}

export interface TgpuMutable<out TData extends BaseData> extends TgpuBufferShorthandBase<TData> {
  readonly resourceType: 'buffer-shorthand';
  readonly usage: 'mutable';
  readonly buffer: TgpuBuffer<TData> & StorageFlag;

  // Accessible on the GPU
  /**
   * @deprecated Use `.$` instead, works the same way.
   */
  value: InferGPU<TData>;
  $: InferGPU<TData>;
  // ---

  readonly [$repr]: Infer<TData>;
}

export interface TgpuReadonly<out TData extends BaseData> extends TgpuBufferShorthandBase<TData> {
  readonly resourceType: 'buffer-shorthand';
  readonly usage: 'readonly';
  readonly buffer: TgpuBuffer<TData> & StorageFlag;

  // Accessible on the GPU
  /**
   * @deprecated Use `.$` instead, works the same way.
   */
  readonly value: InferGPU<TData>;
  readonly $: InferGPU<TData>;
  // ---

  readonly [$repr]: Infer<TData>;
}

export interface TgpuUniform<out TData extends BaseData> extends TgpuBufferShorthandBase<TData> {
  readonly resourceType: 'buffer-shorthand';
  readonly usage: 'uniform';
  readonly buffer: TgpuBuffer<TData> & UniformFlag;

  // Accessible on the GPU
  /**
   * @deprecated Use `.$` instead, works the same way.
   */
  readonly value: InferGPU<TData>;
  readonly $: InferGPU<TData>;
  // ---

  readonly [$repr]: Infer<TData>;
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
  readonly [$internal] = true;
  readonly [$getNameForward]: object;
  readonly usage: TType;
  readonly buffer: TgpuBuffer<TData> &
    (TType extends 'mutable' | 'readonly' ? StorageFlag : UniformFlag);

  constructor(
    usage: TType,
    buffer: TgpuBuffer<TData> & (TType extends 'mutable' | 'readonly' ? StorageFlag : UniformFlag),
  ) {
    this.usage = usage;
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
    const usage = this.usage;

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

  get value(): InferGPU<TData> {
    return this.$;
  }

  toString(): string {
    return `${this.usage}BufferShorthand:${getName(this) ?? '<unnamed>'}`;
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const dataType = this.buffer.dataType;
    const id = ctx.makeUniqueIdentifier(getName(this), 'global');
    const { group, binding } = ctx.allocateFixedEntry(
      this.usage === 'uniform' ? { uniform: dataType } : { storage: dataType, access: this.usage },
      this.buffer,
    );

    return ctx.gen.declareGlobalVar({
      group,
      binding,
      scope: this.usage,
      id,
      dataType,
      init: undefined,
    });
  }
}
