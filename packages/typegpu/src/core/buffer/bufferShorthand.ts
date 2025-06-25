import type { BaseData } from '../../data/wgslTypes.ts';
import type { StorageFlag } from '../../extension.ts';
import { setName, type TgpuNamable } from '../../shared/meta.ts';
import type { Infer, InferGPU, InferPartial } from '../../shared/repr.ts';
import { $getNameForward, $internal } from '../../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import type { TgpuBuffer, UniformFlag } from './buffer.ts';
import type { TgpuBufferUsage } from './bufferUsage.ts';

// ----------
// Public API
// ----------

interface TgpuBufferShorthandBase<TData extends BaseData> extends TgpuNamable {
  readonly [$internal]: true;

  // Accessible on the CPU
  write(data: Infer<TData>): void;
  writePartial(data: InferPartial<TData>): void;
  read(): Promise<Infer<TData>>;
  // ---
}

export interface TgpuMutable<TData extends BaseData>
  extends TgpuBufferShorthandBase<TData> {
  readonly resourceType: 'mutable';
  readonly buffer: TgpuBuffer<TData> & StorageFlag;

  // Accessible on the GPU
  value: InferGPU<TData>;
  $: InferGPU<TData>;
  // ---
}

export interface TgpuReadonly<TData extends BaseData>
  extends TgpuBufferShorthandBase<TData> {
  readonly resourceType: 'readonly';
  readonly buffer: TgpuBuffer<TData> & StorageFlag;

  // Accessible on the GPU
  readonly value: InferGPU<TData>;
  readonly $: InferGPU<TData>;
  // ---
}

export interface TgpuUniform<TData extends BaseData>
  extends TgpuBufferShorthandBase<TData> {
  readonly resourceType: 'uniform';
  readonly buffer: TgpuBuffer<TData> & UniformFlag;

  // Accessible on the GPU
  readonly value: InferGPU<TData>;
  readonly $: InferGPU<TData>;
  // ---
}

export type TgpuBufferShorthand<TData extends BaseData> =
  | TgpuMutable<TData>
  | TgpuReadonly<TData>
  | TgpuUniform<TData>;

export function isBufferShorthand<TData extends BaseData>(
  value: unknown | TgpuBufferShorthand<TData>,
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
  readonly #usage: TgpuBufferUsage<TData, TType>;

  constructor(
    public readonly resourceType: TType,
    public readonly buffer:
      & TgpuBuffer<TData>
      & (TType extends 'mutable' | 'readonly' ? StorageFlag : UniformFlag),
  ) {
    this[$getNameForward] = buffer;
    // biome-ignore lint/suspicious/noExplicitAny: too complex a type
    this.#usage = (this.buffer as any).as(this.resourceType);
  }

  $name(label: string): this {
    setName(this[$getNameForward], label);
    return this;
  }

  write(data: Infer<TData>): void {
    this.buffer.write(data);
  }

  writePartial(data: InferPartial<TData>): void {
    this.buffer.writePartial(data);
  }

  read(): Promise<Infer<TData>> {
    return this.buffer.read();
  }

  get value(): InferGPU<TData> {
    return this.#usage.value;
  }

  '~resolve'(ctx: ResolutionCtx): string {
    return ctx.resolve(this.#usage);
  }

  get $(): InferGPU<TData> {
    return this.value;
  }
}
