import type { AnyData } from '../../data/dataTypes.ts';
import type { WgslStorageTexture, WgslTexture } from '../../data/texture.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import type { GPUValueOf, Infer, InferGPU } from '../../shared/repr.ts';
import { $gpuValueOf, $internal, $providing } from '../../shared/symbols.ts';
import type { TgpuBufferShorthand } from '../buffer/bufferShorthand.ts';
import type { TgpuBufferUsage } from './../buffer/bufferUsage.ts';
import type { TgpuConst } from '../constant/tgpuConstant.ts';
import type { Withable } from '../root/rootTypes.ts';
import type { TgpuTextureView } from '../texture/texture.ts';
import type { TgpuVar, VariableScope } from '../variable/tgpuVariable.ts';

export interface TgpuSlot<T> extends TgpuNamable {
  readonly [$internal]: true;
  readonly resourceType: 'slot';

  readonly defaultValue: T | undefined;

  /**
   * Used to determine if code generated using either value `a` or `b` in place
   * of the slot will be equivalent. Defaults to `Object.is`.
   */
  areEqual(a: T, b: T): boolean;

  readonly [$gpuValueOf]: GPUValueOf<T>;
  /**
   * @deprecated Use `.$` instead, works the same way.
   */
  readonly value: GPUValueOf<T>;
  readonly $: GPUValueOf<T>;
}

export interface TgpuLazy<out T> extends Withable<TgpuLazy<T>> {
  readonly [$internal]: {
    compute(): T;
  };
  readonly resourceType: 'lazy';

  readonly [$gpuValueOf]: GPUValueOf<T>;
  /**
   * @deprecated Use `.$` instead, works the same way.
   */
  readonly value: GPUValueOf<T>;
  readonly $: GPUValueOf<T>;

  // Type-tokens, not available at runtime
  readonly [$providing]?: Providing | undefined;
  // ---
}

export type AccessorIn<TSchema extends AnyData> = TSchema extends
  WgslTexture | WgslStorageTexture ? (
    | (() => Infer<TSchema> | TgpuTextureView<TSchema>)
    | Infer<TSchema>
    | TgpuTextureView<TSchema>
  )
  : (
    | (() => Infer<TSchema>)
    | TgpuBufferUsage<TSchema>
    | TgpuBufferShorthand<TSchema>
    | TgpuVar<VariableScope, TSchema>
    | TgpuConst<TSchema>
    | Infer<TSchema>
  );

export type MutableAccessorIn<TSchema extends AnyData> = TSchema extends
  WgslTexture | WgslStorageTexture ? (
    | (() => Infer<TSchema> | TgpuTextureView<TSchema>)
    | TgpuTextureView<TSchema>
  )
  : (
    | (() => Infer<TSchema>)
    | TgpuBufferUsage<TSchema>
    | TgpuBufferShorthand<TSchema>
    | TgpuVar<VariableScope, TSchema>
  );

export interface TgpuAccessor<T extends AnyData = AnyData> extends TgpuNamable {
  readonly [$internal]: true;
  readonly resourceType: 'accessor';

  readonly schema: T;
  readonly defaultValue: AccessorIn<T> | undefined;
  readonly slot: TgpuSlot<AccessorIn<T>>;

  readonly [$gpuValueOf]: InferGPU<T>;
  /**
   * @deprecated Use `.$` instead, works the same way.
   */
  readonly value: InferGPU<T>;
  readonly $: InferGPU<T>;
}

export interface TgpuMutableAccessor<T extends AnyData = AnyData>
  extends TgpuNamable {
  readonly [$internal]: true;
  readonly resourceType: 'mutable-accessor';

  readonly schema: T;
  readonly defaultValue: MutableAccessorIn<T> | undefined;
  readonly slot: TgpuSlot<MutableAccessorIn<T>>;

  readonly [$gpuValueOf]: InferGPU<T>;
  value: InferGPU<T>;
  $: InferGPU<T>;
}

/**
 * Represents a value that is available at resolution time.
 */
export type Eventual<T> = T | TgpuSlot<T> | TgpuLazy<T>;

export type SlotValuePair<T = unknown> = [TgpuSlot<T>, T];

export type Providing = {
  inner: object;
  pairs: SlotValuePair[];
};

export function isSlot<T>(value: unknown | TgpuSlot<T>): value is TgpuSlot<T> {
  return (value as TgpuSlot<T>)?.resourceType === 'slot';
}

export function isLazy<T extends TgpuLazy<unknown>>(
  value: T | unknown,
): value is T {
  return (value as T)?.resourceType === 'lazy';
}

export function isProviding(
  value: unknown,
): value is { [$providing]: Providing } {
  return (value as { [$providing]: Providing })?.[$providing] !== undefined;
}

export function isAccessor<T extends AnyData>(
  value: unknown | TgpuAccessor<T>,
): value is TgpuAccessor<T> {
  return (value as TgpuAccessor<T>)?.resourceType === 'accessor';
}

export function isMutableAccessor<T extends AnyData>(
  value: unknown | TgpuMutableAccessor<T>,
): value is TgpuMutableAccessor<T> {
  return (value as TgpuMutableAccessor<T>)?.resourceType === 'mutable-accessor';
}
