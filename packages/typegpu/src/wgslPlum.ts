import { type TgpuSettable, TgpuSettableTrait } from './settableTrait';
import type { Tgpu, TgpuNamable, TgpuResolvable } from './types';

// ----------
// Public API
// ----------

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
  `This plum's value is sourced from outside the runtime.`,
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

/**
 * Creates a computed plum. Its value depends on the plums read using `get`
 * inside the `compute` function, so cannot be set imperatively.
 *
 * @param compute A pure function that describes this plum's value.
 */
export function plum<T extends Tgpu>(
  compute: (get: Getter) => T,
): TgpuPlum<T> & TgpuResolvable;

/**
 * Creates a computed plum. Its value depends on the plums read using `get`
 * inside the `compute` function, so cannot be set imperatively.
 *
 * @param compute A pure function that describes this plum's value.
 */
export function plum<T>(compute: (get: Getter) => T): TgpuPlum<T>;

/**
 * Creates a plum with an initial value of `initial`.
 * Its value can be updated by calling `runtime.setPlum(thePlum, newValue)`.
 *
 * @param initial The initial value of this plum.
 */
export function plum<T extends Tgpu>(
  initial: T,
): TgpuPlum<T> & TgpuSettable & TgpuResolvable;

/**
 * Creates a plum with an initial value of `initial`.
 * Its value can be updated by calling `runtime.setPlum(thePlum, newValue)`.
 *
 * @param initial The initial value of this plum.
 */
export function plum<T>(initial: T): TgpuPlum<T> & TgpuSettable;

export function plum<T>(
  initialOrCompute: T | ((get: Getter) => T),
): TgpuPlum<T> | (TgpuPlum<T> & TgpuSettable) {
  if (typeof initialOrCompute === 'function') {
    return new TgpuDerivedPlumImpl(initialOrCompute as (get: Getter) => T);
  }

  return new TgpuSourcePlumImpl(initialOrCompute);
}

export function plumFromEvent<T>(
  subscribe: (listener: () => unknown) => Unsubscribe,
  getLatest: () => T,
): TgpuPlum<T> & TgpuExternalPlum {
  return new TgpuExternalPlumImpl(subscribe, getLatest);
}

export function isPlum<T>(value: TgpuPlum<T> | unknown): value is TgpuPlum<T> {
  return (value as TgpuPlum).__brand === 'TgpuPlum';
}

// --------------
// Implementation
// --------------

class TgpuSourcePlumImpl<TValue> implements TgpuPlum<TValue>, TgpuSettable {
  readonly __brand = 'TgpuPlum';
  readonly [TgpuSettableTrait] = true;

  private _label: string | undefined;

  constructor(private readonly _initial: TValue) {}

  compute(_get: Getter) {
    return this._initial;
  }

  $name(label: string): this {
    this._label = label;
    return this;
  }

  get label(): string | undefined {
    return this._label;
  }

  toString(): string {
    return `plum:${this._label ?? '<unnamed>'}`;
  }
}

class TgpuDerivedPlumImpl<TValue> implements TgpuPlum<TValue> {
  readonly __brand = 'TgpuPlum';
  private _label: string | undefined;

  constructor(private readonly _compute: (get: Getter) => TValue) {}

  $name(label: string): this {
    this._label = label;
    return this;
  }

  get label(): string | undefined {
    return this._label;
  }

  compute(get: Getter): TValue {
    return this._compute(get);
  }

  toString(): string {
    return `plum:${this._label ?? '<unnamed>'}`;
  }
}

class TgpuExternalPlumImpl<TValue>
  implements TgpuPlum<TValue>, TgpuExternalPlum
{
  readonly __brand = 'TgpuPlum';
  readonly [TgpuExternalPlumTrait] = true;

  private _label: string | undefined;
  private _prev: TValue;
  private _version = 0;

  constructor(
    private readonly _subscribe: (listener: () => unknown) => Unsubscribe,
    private readonly _getLatest: () => TValue,
  ) {
    this._prev = _getLatest();
  }

  $name(label: string): this {
    this._label = label;
    return this;
  }

  get label(): string | undefined {
    return this._label;
  }

  get version(): number {
    return this._version;
  }

  subscribe(listener: () => unknown): Unsubscribe {
    return this._subscribe(listener);
  }

  compute(): TValue {
    const latest = this._getLatest();

    if (!Object.is(latest, this._prev)) {
      this._version++;
      this._prev = latest;
    }

    return this._prev;
  }

  toString(): string {
    return `plum:${this._label ?? '<unnamed>'}`;
  }
}
