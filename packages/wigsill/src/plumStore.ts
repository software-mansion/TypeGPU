import type { Getter, WgslPlum, WgslSettable } from './wgslPlum';

type Listener = () => unknown;
type Unsubscribe = () => void;

type PlumState<T = unknown> = {
  value: T;
  /**
   * Gets incremented each time its value changes.
   * Allows dependents to determine if they are dirty or not.
   */
  version: number;
  /**
   * Map of dependencies to the versions used to
   * compute the latest value.
   */
  dependencies: Map<WgslPlum, number>;
  active?: PlumActiveState | undefined;
};

/**
 * Tracked state of a plum that is being subscribed to.
 */
type PlumActiveState = {
  /**
   * Cannot be a WeakSet, because we need to iterate on them.
   */
  listeners: Set<Listener>;
  unsubs: Set<Unsubscribe>;
};

export class PlumStore {
  private readonly _stateMap = new WeakMap<WgslPlum, PlumState>();

  private _getState<T>(plum: WgslPlum<T>): PlumState<T> {
    let state = this._stateMap.get(plum) as PlumState<T> | undefined;

    if (!state) {
      const dependencies = new Map<WgslPlum, number>();

      const getter = (<T>(dep: WgslPlum<T>) => {
        // registering dependency.
        if (!dependencies.has(dep)) {
          const depState = this._getState(dep);
          dependencies.set(dep, depState.version);
        }

        return this.get(dep);
      }) as Getter;

      state = {
        value: plum.compute(getter),
        dependencies,
        version: 0,
      };
      this._stateMap.set(plum, state);
    }

    return state;
  }

  private _recompute<T>(plum: WgslPlum<T>): T {
    const state = this._getState(plum);

    if (state.active) {
      // Unsubscribing from old dependencies
      for (const unsub of state.active.unsubs) {
        unsub();
      }
    }

    const newDependencies = new Map<WgslPlum, number>();

    const getter = (<T>(dep: WgslPlum<T>) => {
      // registering dependency.
      if (!newDependencies.has(dep)) {
        const depState = this._getState(dep);
        newDependencies.set(dep, depState.version);
      }

      return this.get(dep);
    }) as Getter;

    const newValue = plum.compute(getter);

    state.dependencies = newDependencies;
    if (state.active) {
      // subscribing to dependencies
      for (const [dep] of state.dependencies) {
        state.active.unsubs.add(
          this.subscribe(dep, () => {
            this._recompute(plum);
          }),
        );
      }
    }

    if (Object.is(state.value, newValue)) {
      return state.value;
    }

    state.value = newValue;
    state.version++;

    if (state.active) {
      for (const listener of state.active.listeners) {
        listener();
      }
    }

    return state.value;
  }

  get<T>(plum: WgslPlum<T>): T {
    const state = this._getState(plum);

    if (state.dependencies.size === 0 || state.active) {
      // Return memoized value, the dependencies are keeping it up to date.
      return state.value;
    }

    const dirty = [...state.dependencies.entries()].some(
      ([dep, prevVersion]) => {
        const depState = this._getState(dep);
        return depState.version !== prevVersion;
      },
    );

    if (!dirty) {
      // No need to recompute
      return state.value;
    }

    return this._recompute(plum);
  }

  set<T>(plum: WgslPlum<T> & WgslSettable, value: T): void {
    const state = this._getState(plum);

    if (Object.is(state.value, value)) {
      // Value is the same as before, aborting.
      return;
    }

    state.value = value;
    state.version++;

    if (state.active) {
      for (const listener of state.active.listeners) {
        listener();
      }
    }
  }

  subscribe(plum: WgslPlum, listener: Listener): Unsubscribe {
    const state = this._getState(plum);
    if (!state.active) {
      const unsubs = new Set<Unsubscribe>();
      state.active = {
        listeners: new Set(),
        unsubs,
      };
      // subscribing to dependencies
      for (const [dep] of state.dependencies) {
        unsubs.add(
          this.subscribe(dep, () => {
            this._recompute(plum);
          }),
        );
      }
    }

    state.active.listeners.add(listener);

    return () => {
      if (!state.active) {
        return;
      }

      state.active.listeners.delete(listener);

      if (state.active.listeners.size === 0) {
        // no listeners left, deactivate
        state.active = undefined;
      }
    };
  }
}
