import { type BaseData } from '../../data/wgslTypes.ts';
import type { Infer, InferGPU } from '../../shared/repr.ts';
import { $gpuValueOf, $internal, $repr } from '../../shared/symbols.ts';
import type { BindableBufferUsage } from '../../types.ts';

// TODO(#2666) - remove this file

// ----------
// Public API
// ----------

interface TgpuBufferUsage<
  TData extends BaseData = BaseData,
  TUsage extends BindableBufferUsage = BindableBufferUsage,
> {
  readonly resourceType: 'buffer-usage';
  readonly usage: TUsage;
  readonly [$repr]: Infer<TData>;

  readonly [$gpuValueOf]: InferGPU<TData>;
  /**
   * @deprecated Use `.$` instead, works the same way.
   */
  value: InferGPU<TData>;
  $: InferGPU<TData>;

  readonly [$internal]: {
    readonly dataType: TData;
  };
}

/**
 * @deprecated use TgpuUniform instead.
 */
export interface TgpuBufferUniform<TData extends BaseData> extends TgpuBufferUsage<
  TData,
  'uniform'
> {
  /**
   * @deprecated Use `.$` instead, works the same way.
   */
  readonly value: InferGPU<TData>;
  readonly $: InferGPU<TData>;
}

/**
 * @deprecated use TgpuReadonly instead.
 */
export interface TgpuBufferReadonly<TData extends BaseData> extends TgpuBufferUsage<
  TData,
  'readonly'
> {
  /**
   * @deprecated Use `.$` instead, works the same way.
   */
  readonly value: InferGPU<TData>;
  readonly $: InferGPU<TData>;
}

/**
 * @deprecated use TgpuMutable instead.
 */
export interface TgpuBufferMutable<TData extends BaseData> extends TgpuBufferUsage<
  TData,
  'mutable'
> {}
