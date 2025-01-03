import type { AnyWgslData } from '../../data';
import type { TgpuNamable } from '../../namable';
import type { Infer } from '../../shared/repr';
import type { TgpuFn } from '../function/tgpuFn';
import type { TgpuResolvable } from './../../types';
import type { TgpuBufferUsage } from './../buffer/bufferUsage';

export interface TgpuSlot<T> extends TgpuNamable {
  readonly resourceType: 'slot';

  readonly defaultValue: T | undefined;

  readonly label?: string | undefined;
  /**
   * Used to determine if code generated using either value `a` or `b` in place
   * of the slot will be equivalent. Defaults to `Object.is`.
   */
  areEqual(a: T, b: T): boolean;

  readonly value: Infer<T>;
}

export interface TgpuDerived<T> {
  readonly resourceType: 'derived';
  readonly value: Infer<T>;

  with<TValue>(slot: TgpuSlot<TValue>, value: Eventual<TValue>): TgpuDerived<T>;

  /**
   * @internal
   */
  '~compute'(): T;
}

export interface TgpuAccessor<T extends AnyWgslData>
  extends TgpuResolvable,
    TgpuNamable {
  readonly resourceType: 'accessor';

  readonly schema: T;
  readonly defaultValue:
    | TgpuFn<[], T>
    | TgpuBufferUsage<T>
    | Infer<T>
    | undefined;
  readonly slot: TgpuSlot<TgpuFn<[], T> | TgpuBufferUsage<T> | Infer<T>>;

  readonly label?: string | undefined;
  readonly value: Infer<T>;
}

/**
 * Represents a value that is available at resolution time.
 */
export type Eventual<T> = T | TgpuSlot<T> | TgpuDerived<T>;

export type SlotValuePair<T> = [TgpuSlot<T>, T];

export function isSlot<T>(value: unknown | TgpuSlot<T>): value is TgpuSlot<T> {
  return (value as TgpuSlot<T>)?.resourceType === 'slot';
}

export function isDerived<T extends TgpuDerived<unknown>>(
  value: T | unknown,
): value is T {
  return (value as T)?.resourceType === 'derived';
}

export function isAccessor<T extends AnyWgslData>(
  value: unknown | TgpuAccessor<T>,
): value is TgpuAccessor<T> {
  return (value as TgpuAccessor<T>)?.resourceType === 'accessor';
}
