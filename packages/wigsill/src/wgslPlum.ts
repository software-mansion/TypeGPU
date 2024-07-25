import PerRuntimeState from './perRuntimeState';
import type { ResolutionCtx, Wgsl, WgslResolvable } from './types';
import type WigsillRuntime from './wigsillRuntime';

// ----------
// Public API
// ----------

type Listener = () => unknown;
type Unsubscribe = () => void;

export type Getter = <T>(plum: WgslPlum<T>) => T;

export interface WgslPlum<TValue = unknown> {
  $name(label: string): this;

  read(runtime: WigsillRuntime): TValue;
  subscribe(runtime: WigsillRuntime, listener: () => unknown): Unsubscribe;
}

export interface WgslSettable<TValue> {
  set(runtime: WigsillRuntime, value: TValue): void;
}

export function plum<T extends Wgsl>(
  initial: T,
): WgslPlum<T> & WgslSettable<T> & WgslResolvable;

export function plum<T>(initial: T): WgslPlum<T> & WgslSettable<T>;

export function plum<T>(initial: T): WgslPlum<T> & WgslSettable<T> {
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

class PlumStore {
  private readonly _stateMap = new WeakMap<WgslPlumImpl, PlumState>();
  private readonly _activeStateMap = new WeakMap<
    WgslPlumImpl,
    PlumActiveState
  >();

  private _getState<T>(plum: WgslPlumImpl<T>): PlumState<T> {
    let state = this._stateMap.get(plum) as PlumState<T> | undefined;

    if (!state) {
      const dependencies = new Set<WgslPlumImpl>();

      const getter = (<T>(dep: WgslPlumImpl<T>) => {
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

  get<T>(plum: WgslPlumImpl<T>): T {
    return this._getState(plum).value;
  }

  set<T>(plum: WgslPlumImpl<T>, value: T): void {
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

  subscribe(plum: WgslPlumImpl, listener: Listener): Unsubscribe {
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

type WgslPlumImpl<T = unknown> = WgslSourcePlumImpl<T> | WgslDerivedPlumImpl<T>;

const stores = new PerRuntimeState(() => new PlumStore());

class WgslSourcePlumImpl<TValue>
  implements WgslPlum<TValue>, WgslSettable<TValue>, WgslResolvable
{
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

  read(runtime: WigsillRuntime): TValue {
    const store = stores.get(runtime);
    return store.get(this);
  }

  set(runtime: WigsillRuntime, value: TValue) {
    const store = stores.get(runtime);
    store.set(this, value);
  }

  subscribe(runtime: WigsillRuntime, listener: () => unknown): Unsubscribe {
    const store = stores.get(runtime);
    return store.subscribe(this, listener);
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

  read(runtime: WigsillRuntime): TValue {
    const store = stores.get(runtime);
    return store.get(this);
  }

  subscribe(runtime: WigsillRuntime, listener: () => unknown): Unsubscribe {
    const store = stores.get(runtime);
    return store.subscribe(this, listener);
  }
}
