import type { ResolutionCtx, Wgsl, WgslResolvable } from './types';

// ----------
// Public API
// ----------

type Listener = () => unknown;
type Unsubscribe = () => void;

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
  initial: T,
): WgslPlum<T> & WgslSettable & WgslResolvable;

export function plum<T>(initial: T): WgslPlum<T> & WgslSettable;

export function plum<T>(initial: T): WgslPlum<T> & WgslSettable {
  return new WgslSourcePlumImpl(initial);
}

// --------------
// Implementation
// --------------

type PlumState<T = unknown> = {
  value: T;
  dirty: boolean;
  dependencies: Set<WgslPlum>;
};

/**
 * Tracked state of a plum that is being subscribed to.
 */
type PlumActiveState = {
  /**
   * Cannot be a WeakSet, because we need to iterate on them.
   */
  listeners: Set<Listener>;
};

export class PlumStore {
  private readonly _stateMap = new WeakMap<WgslPlum, PlumState>();
  private readonly _activeStateMap = new WeakMap<WgslPlum, PlumActiveState>();

  private _getState<T>(plum: WgslPlum<T>): PlumState<T> {
    let state = this._stateMap.get(plum) as PlumState<T> | undefined;

    if (!state) {
      const dependencies = new Set<WgslPlum>();

      const getter = (<T>(dep: WgslPlum<T>) => {
        // registering dependency.
        if (!dependencies.has(dep)) {
          dependencies.add(dep);
        }

        return this.get(dep);
      }) as Getter;

      state = {
        value: plum.compute(getter),
        dependencies,
        dirty: false,
      };
      this._stateMap.set(plum, state);
    }

    return state;
  }

  get<T>(plum: WgslPlum<T>): T {
    return this._getState(plum).value;
  }

  set<T>(plum: WgslPlum<T> & WgslSettable, value: T): void {
    const state = this._getState(plum);
    state.value = value;

    const activeState = this._activeStateMap.get(plum);
    if (!activeState) {
      return;
    }

    for (const listener of activeState.listeners) {
      listener();
    }
  }

  subscribe(plum: WgslPlum, listener: Listener): Unsubscribe {
    const activeState = (() => {
      let state = this._activeStateMap.get(plum);
      if (!state) {
        state = {
          listeners: new Set(),
        };
        this._activeStateMap.set(plum, state);
      }

      return state;
    })();

    activeState.listeners.add(listener);

    return () => {
      activeState.listeners.delete(listener);

      if (activeState.listeners.size === 0) {
        // no listeners left, deactivate
        this._activeStateMap.delete(plum);
      }
    };
  }
}

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
}

class WgslDerivedPlumImpl<TValue> implements WgslPlum<TValue>, WgslResolvable {
  private _label: string | undefined;
  private readonly _listeners = new Set<Listener>();

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
}
