import type { WgslStorageTexture, WgslTexture } from '../../data/texture.ts';
import type { BaseData } from '../../data/wgslTypes.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import type { GPUValueOf, Infer, InferGPU } from '../../shared/repr.ts';
import { $gpuValueOf, $internal, $providing } from '../../shared/symbols.ts';
import type { UnwrapRuntimeConstructor } from '../../tgpuBindGroupLayout.ts';
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
  toString(): string;
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

export interface TgpuAccessor<T extends BaseData = BaseData>
  extends TgpuNamable {
  readonly [$internal]: true;
  readonly resourceType: 'accessor';

  readonly schema: T;
  readonly defaultValue: TgpuAccessor.In<T> | undefined;
  readonly slot: TgpuSlot<TgpuAccessor.In<T>>;

  readonly [$gpuValueOf]: InferGPU<T>;
  /**
   * @deprecated Use `.$` instead, works the same way.
   */
  readonly value: InferGPU<T>;
  readonly $: InferGPU<T>;
}

type DataAccessorIn<T extends BaseData> =
  | (() => DataAccessorIn<T>)
  | TgpuBufferUsage<T>
  | TgpuBufferShorthand<T>
  | TgpuVar<VariableScope, T>
  | TgpuConst<T>
  | Infer<T>;

type TextureAccessorIn<T extends WgslTexture | WgslStorageTexture> =
  | (() => TextureAccessorIn<T>)
  | Infer<T>
  | TgpuTextureView<T>;

export declare namespace TgpuAccessor {
  type In<T extends BaseData | ((count: number) => BaseData)> =
    UnwrapRuntimeConstructor<T> extends WgslTexture | WgslStorageTexture
      ? TextureAccessorIn<UnwrapRuntimeConstructor<T>>
      : DataAccessorIn<UnwrapRuntimeConstructor<T>>;
}

export interface TgpuMutableAccessor<T extends BaseData = BaseData>
  extends TgpuNamable {
  readonly [$internal]: true;
  readonly resourceType: 'mutable-accessor';

  readonly schema: T;
  readonly defaultValue: TgpuMutableAccessor.In<T> | undefined;
  readonly slot: TgpuSlot<TgpuMutableAccessor.In<T>>;

  readonly [$gpuValueOf]: InferGPU<T>;
  value: InferGPU<T>;
  $: InferGPU<T>;
}

type MutableDataAccessorIn<T extends BaseData> =
  | (() => Infer<T> | MutableDataAccessorIn<T>)
  | TgpuBufferUsage<T>
  | TgpuBufferShorthand<T>
  | TgpuVar<VariableScope, T>;

type MutableTextureAccessorIn<T extends WgslTexture | WgslStorageTexture> =
  | (() => Infer<T> | TgpuTextureView<T> | MutableTextureAccessorIn<T>)
  | TgpuTextureView<T>;

export declare namespace TgpuMutableAccessor {
  type In<T extends BaseData | ((count: number) => BaseData)> =
    UnwrapRuntimeConstructor<T> extends WgslTexture | WgslStorageTexture
      ? MutableTextureAccessorIn<UnwrapRuntimeConstructor<T>>
      : MutableDataAccessorIn<UnwrapRuntimeConstructor<T>>;
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

export function isSlot<T>(value: unknown): value is TgpuSlot<T> {
  return (value as TgpuSlot<T>)?.resourceType === 'slot';
}

export function isLazy<T>(value: unknown): value is TgpuLazy<T> {
  return (value as TgpuLazy<T>)?.resourceType === 'lazy';
}

export function isProviding(
  value: unknown,
): value is { [$providing]: Providing } {
  return (value as { [$providing]: Providing })?.[$providing] !== undefined;
}

export function isAccessor<T extends BaseData>(
  value: unknown,
): value is TgpuAccessor<T> {
  return (value as TgpuAccessor<T>)?.resourceType === 'accessor';
}

export function isMutableAccessor<T extends BaseData>(
  value: unknown,
): value is TgpuMutableAccessor<T> {
  return (value as TgpuMutableAccessor<T>)?.resourceType === 'mutable-accessor';
}
