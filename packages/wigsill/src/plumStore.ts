import {
  type ExtractPlumValue,
  type Getter,
  type WgslPlum,
  type WgslSettable,
  isExternalPlum,
} from './wgslPlum';

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

  /**
   * Used to inspect the current state of a plum.
   * To be used mostly in unit tests.
   */
  inspect(plum: WgslPlum): PlumState | undefined {
    return this._stateMap.get(plum);
  }

  private _getState<TPlum extends WgslPlum>(
    plum: TPlum,
  ): PlumState<ExtractPlumValue<TPlum>> {
    type Value = ExtractPlumValue<TPlum>;

    let state = this._stateMap.get(plum) as PlumState<Value> | undefined;

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
        value: plum.compute(getter) as Value,
        dependencies,
        version: 0,
      };
      this._stateMap.set(plum, state);
    }

    return state;
  }

  private _recompute<TPlum extends WgslPlum>(
    plum: TPlum,
  ): ExtractPlumValue<TPlum> {
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

    state.value = newValue as ExtractPlumValue<TPlum>;
    state.version = isExternalPlum(plum) ? plum.version : state.version + 1;

    if (state.active) {
      // copying, because listeners may change after we notify our dependents.
      const listeners = [...state.active.listeners];
      for (const listener of listeners) {
        listener();
      }
    }

    return state.value;
  }

  get<TPlum extends WgslPlum>(plum: TPlum): ExtractPlumValue<TPlum> {
    const state = this._getState(plum);

    if (state.active) {
      // Return memoized value, the dependencies are keeping it up to date.
      return state.value;
    }

    let dirty = false;

    if (isExternalPlum(plum)) {
      plum.compute(null as unknown as Getter); // external plums do not use 'get'
      dirty = state.version !== plum.version;
    } else if (state.dependencies.size > 0) {
      dirty = [...state.dependencies.entries()].some(([dep, prevVersion]) => {
        this.get(dep); // allowing dependencies to recompute if necessary.
        const depState = this._getState(dep);

        return depState.version !== prevVersion;
      });
    }

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
      // copying, because listeners may change after we notify our dependents.
      const listeners = [...state.active.listeners];

      for (const listener of listeners) {
        listener();
      }
    }
  }

  subscribe(plum: WgslPlum, listener: Listener): Unsubscribe {
    const state = this._getState(plum);

    let externalUnsub: (() => unknown) | undefined;

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
      // if external, subscribing to itself
      if (isExternalPlum(plum)) {
        externalUnsub = plum.subscribe(() => {
          this._recompute(plum);
        });
      }
    }

    state.active.listeners.add(listener);

    return () => {
      if (!state.active) {
        return;
      }

      state.active.listeners.delete(listener);

      if (state.active.listeners.size === 0) {
        // Unsubscribing from dependencies
        for (const unsub of state.active.unsubs) {
          unsub();
        }
        externalUnsub?.();

        // no listeners left, deactivate
        state.active = undefined;
      }
    };
  }
}
