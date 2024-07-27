import type { ResolutionCtx, Wgsl, WgslResolvable } from './types';

// ----------
// Public API
// ----------

export type Getter = <T>(plum: WgslPlum<T>) => T;

export interface WgslPlum<TValue = unknown> {
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

export function plum<T extends Wgsl>(
  compute: (get: Getter) => T,
): WgslPlum<T> & WgslResolvable;

export function plum<T extends Wgsl>(compute: () => T): WgslPlum<T>;

export function plum<T extends Wgsl>(
  initial: T,
): WgslPlum<T> & WgslSettable & WgslResolvable;

export function plum<T>(initial: T): WgslPlum<T> & WgslSettable;

export function plum<T>(
  initialOrCompute: T | ((get: Getter) => T),
): WgslPlum<T> | (WgslPlum<T> & WgslSettable) {
  if (typeof initialOrCompute === 'function') {
    return new WgslDerivedPlumImpl(initialOrCompute as (get: Getter) => T);
  }

  return new WgslSourcePlumImpl(initialOrCompute);
}

// --------------
// Implementation
// --------------

class WgslSourcePlumImpl<TValue>
  implements WgslPlum<TValue>, WgslSettable, WgslResolvable
{
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
