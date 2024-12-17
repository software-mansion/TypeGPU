import type { TgpuNamable } from '../../namable';
import type { Infer } from '../../shared/repr';

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

export function isSlot<T>(value: unknown | TgpuSlot<T>): value is TgpuSlot<T> {
  return (value as TgpuSlot<T>).resourceType === 'slot';
}

export type SlotValuePair<T> = [TgpuSlot<T>, T];

/**
 * Represents a value that is available at resolution time.
 */
export type Eventual<T> = T | TgpuSlot<T>;
