import type { AnyData } from '../../data/dataTypes.ts';
import type { TgpuNamable } from '../../name.ts';
import type { $repr, Infer, InferGPU } from '../../shared/repr.ts';
import type { TgpuFn } from '../function/tgpuFn.ts';
import type { TgpuBufferUsage } from './../buffer/bufferUsage.ts';

export interface TgpuSlot<T> extends TgpuNamable {
  readonly resourceType: 'slot';
  readonly [$repr]: Infer<T>;
  readonly '~gpuRepr': InferGPU<T>;

  readonly defaultValue: T | undefined;

  /**
   * Used to determine if code generated using either value `a` or `b` in place
   * of the slot will be equivalent. Defaults to `Object.is`.
   */
  areEqual(a: T, b: T): boolean;

  readonly value: InferGPU<T>;
}

export interface TgpuDerived<T> {
  readonly resourceType: 'derived';
  readonly value: InferGPU<T>;
  [$repr]: Infer<T>;
  '~gpuRepr': InferGPU<T>;
  readonly '~providing'?: Providing | undefined;

  with<TValue>(slot: TgpuSlot<TValue>, value: Eventual<TValue>): TgpuDerived<T>;

  /**
   * @internal
   */
  '~compute'(): T;
}

export interface TgpuAccessor<T extends AnyData = AnyData> extends TgpuNamable {
  readonly resourceType: 'accessor';
  readonly [$repr]: Infer<T>;
  readonly '~gpuRepr': InferGPU<T>;

  readonly schema: T;
  readonly defaultValue:
    | TgpuFn<[], T>
    | TgpuBufferUsage<T>
    | Infer<T>
    | undefined;
  readonly slot: TgpuSlot<TgpuFn<[], T> | TgpuBufferUsage<T> | Infer<T>>;

  readonly value: InferGPU<T>;
}

/**
 * Represents a value that is available at resolution time.
 */
export type Eventual<T> = T | TgpuSlot<T> | TgpuDerived<T>;

export type SlotValuePair<T = unknown> = [TgpuSlot<T>, T];

export type Providing = {
  inner: unknown;
  pairs: SlotValuePair[];
};

export function isSlot<T>(value: unknown | TgpuSlot<T>): value is TgpuSlot<T> {
  return (value as TgpuSlot<T>)?.resourceType === 'slot';
}

export function isDerived<T extends TgpuDerived<unknown>>(
  value: T | unknown,
): value is T {
  return (value as T)?.resourceType === 'derived';
}

export function isProviding(
  value: unknown,
): value is { '~providing': Providing } {
  return (value as { '~providing': Providing })?.['~providing'] !== undefined;
}

export function isAccessor<T extends AnyData>(
  value: unknown | TgpuAccessor<T>,
): value is TgpuAccessor<T> {
  return (value as TgpuAccessor<T>)?.resourceType === 'accessor';
}
