import { type TgpuSettable, TgpuSettableTrait } from './settableTrait';
import {
  type Getter,
  type TgpuExternalPlum,
  TgpuExternalPlumTrait,
  type TgpuPlum,
  type Unsubscribe,
} from './tgpuPlumTypes';
import type { TgpuResolvable, Wgsl } from './types';

// ----------
// Public API
// ----------

/**
 * Creates a computed plum. Its value depends on the plums read using `get`
 * inside the `compute` function, so cannot be set imperatively.
 *
 * @param compute A pure function that describes this plum's value.
 */
export function plum<T extends Wgsl>(
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
 * Its value can be updated by calling `root.setPlum(thePlum, newValue)`.
 *
 * @param initial The initial value of this plum.
 */
export function plum<T extends Wgsl>(
  initial: T,
): TgpuPlum<T> & TgpuSettable & TgpuResolvable;

/**
 * Creates a plum with an initial value of `initial`.
 * Its value can be updated by calling `root.setPlum(thePlum, newValue)`.
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
