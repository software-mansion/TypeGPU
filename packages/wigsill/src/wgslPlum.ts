import type { ResolutionCtx, Wgsl, WgslResolvable } from './types';

// ----------
// Public API
// ----------

export type Getter = <T>(plum: WgslPlum<T>) => T;

export interface WgslPlum<TValue = unknown> {
  readonly __brand: 'WgslPlum';

  $name(label: string): this;

  /**
   * Computes the value of this plum. Circumvents the store
   * memoization, so use with care.
   */
  compute(get: Getter): TValue;
}

export const WgslSettableTrait = Symbol('This item can be set');
export interface WgslSettable {
  readonly [WgslSettableTrait]: true;
}

/**
 * Creates a computed plum. Its value depends on the plums read using `get`
 * inside the `compute` function, so cannot be set imperatively.
 *
 * @param compute A pure function that describes this plum's value.
 */
export function plum<T extends Wgsl>(
  compute: (get: Getter) => T,
): WgslPlum<T> & WgslResolvable;

/**
 * Creates a computed plum. Its value depends on the plums read using `get`
 * inside the `compute` function, so cannot be set imperatively.
 *
 * @param compute A pure function that describes this plum's value.
 */
export function plum<T>(compute: (get: Getter) => T): WgslPlum<T>;

/**
 * Creates a plum with an initial value of `initial`.
 * Its value can be updated by calling `runtime.setPlum(thePlum, newValue)`.
 *
 * @param initial The initial value of this plum.
 */
export function plum<T extends Wgsl>(
  initial: T,
): WgslPlum<T> & WgslSettable & WgslResolvable;

/**
 * Creates a plum with an initial value of `initial`.
 * Its value can be updated by calling `runtime.setPlum(thePlum, newValue)`.
 *
 * @param initial The initial value of this plum.
 */
export function plum<T>(initial: T): WgslPlum<T> & WgslSettable;

export function plum<T>(
  initialOrCompute: T | ((get: Getter) => T),
): WgslPlum<T> | (WgslPlum<T> & WgslSettable) {
  if (typeof initialOrCompute === 'function') {
    return new WgslDerivedPlumImpl(initialOrCompute as (get: Getter) => T);
  }

  return new WgslSourcePlumImpl(initialOrCompute);
}

export function isPlum<T>(value: WgslPlum<T> | unknown): value is WgslPlum<T> {
  return (value as WgslPlum).__brand === 'WgslPlum';
}

// --------------
// Implementation
// --------------

class WgslSourcePlumImpl<TValue>
  implements WgslPlum<TValue>, WgslSettable, WgslResolvable
{
  readonly __brand = 'WgslPlum';
  readonly [WgslSettableTrait] = true;

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

  resolve(ctx: ResolutionCtx): string {
    throw new Error('Method not implemented.');
  }

  toString(): string {
    return `plum:${this._label ?? '<unnamed>'}`;
  }
}

class WgslDerivedPlumImpl<TValue> implements WgslPlum<TValue>, WgslResolvable {
  readonly __brand = 'WgslPlum';
  private _label: string | undefined;

  constructor(private readonly _compute: (get: Getter) => TValue) {}

  $name(label: string): this {
    this._label = label;
    return this;
  }

  get label(): string | undefined {
    return this._label;
  }

  resolve(ctx: ResolutionCtx): string {
    throw new Error('Method not implemented.');
  }

  compute(get: Getter): TValue {
    return this._compute(get);
  }

  toString(): string {
    return `plum:${this._label ?? '<unnamed>'}`;
  }
}
