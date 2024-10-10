import type { TgpuNamable } from './namable';

export type Getter = <T>(plum: TgpuPlum<T>) => T;
export type Unsubscribe = () => unknown;
export type ExtractPlumValue<T> = T extends TgpuPlum<infer TValue>
  ? TValue
  : never;

export interface TgpuPlum<TValue = unknown> extends TgpuNamable {
  readonly __brand: 'TgpuPlum';

  /**
   * Computes the value of this plum. Circumvents the store
   * memoization, so use with care.
   */
  compute(get: Getter): TValue;
}

export const TgpuExternalPlumTrait = Symbol(
  `This plum's value is sourced from outside the root.`,
);

export interface TgpuExternalPlum {
  readonly [TgpuExternalPlumTrait]: true;

  readonly version: number;
  subscribe(listener: () => unknown): Unsubscribe;
}

export function isExternalPlum(
  value: unknown | TgpuExternalPlum,
): value is TgpuExternalPlum {
  return (value as TgpuExternalPlum)[TgpuExternalPlumTrait] === true;
}

export function isPlum<T>(value: TgpuPlum<T> | unknown): value is TgpuPlum<T> {
  return (value as TgpuPlum).__brand === 'TgpuPlum';
}
