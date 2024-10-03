import type { TgpuSettable } from './settableTrait';
import {
  type ExtractPlumValue,
  type Getter,
  type TgpuPlum,
  isExternalPlum,
} from './tgpuPlumTypes';

export type PlumListener<T> = (newValue: T) => unknown;
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
  dependencies: Map<TgpuPlum, number>;
  active?: PlumActiveState<T> | undefined;
};

/**
 * Tracked state of a plum that is being subscribed to.
 */
type PlumActiveState<T> = {
  /**
   * Cannot be a WeakSet, because we need to iterate on them.
   */
  listeners: Set<PlumListener<T>>;
  unsubs: Set<Unsubscribe>;
};

export class PlumStore {
  private readonly _stateMap = new WeakMap<TgpuPlum, PlumState>();

  /**
   * Used to inspect the current state of a plum.
   * To be used mostly in unit tests.
   */
  inspect(plum: TgpuPlum): PlumState | undefined {
    return this._stateMap.get(plum);
  }

  private _getState<T>(plum: TgpuPlum<T>): PlumState<T> {
    let state = this._stateMap.get(plum) as PlumState<T> | undefined;

    if (!state) {
      const { value, dependencies } = this._computeAndGatherDependencies(plum);

      state = {
        value,
        dependencies,
        version: 0,
      } as PlumState<T>;

      this._stateMap.set(plum, state as PlumState);
    }

    return state;
  }

  private _notifyListeners<T>(plum: TgpuPlum<T>): void {
    const state = this._getState(plum);

    if (!state.active) {
      return;
    }

    // Copying, because listeners may change after we notify our dependents.
    const listeners = [...state.active.listeners];

    for (const listener of listeners) {
      listener(state.value);
    }
  }

  private _computeAndGatherDependencies<T>(plum: TgpuPlum<T>) {
    const dependencies = new Map<TgpuPlum, number>();

    const getter = (<T>(dep: TgpuPlum<T>) => {
      // registering dependency.
      if (!dependencies.has(dep)) {
        const depState = this._getState(dep);
        dependencies.set(dep, depState.version);
      }

      return this.get(dep);
    }) as Getter;

    return { value: plum.compute(getter), dependencies };
  }

  private _recompute<T>(plum: TgpuPlum<T>): T {
    const state = this._getState(plum);

    if (state.active) {
      // Unsubscribing from old dependencies
      for (const unsub of state.active.unsubs) {
        unsub();
      }
    }

    const { value, dependencies } = this._computeAndGatherDependencies(plum);

    state.dependencies = dependencies;
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

    if (Object.is(state.value, value)) {
      return state.value;
    }

    state.value = value;
    state.version = isExternalPlum(plum) ? plum.version : state.version + 1;

    this._notifyListeners(plum);

    return state.value;
  }

  get<TPlum extends TgpuPlum>(plum: TPlum): ExtractPlumValue<TPlum> {
    const state = this._getState(plum);

    if (state.active) {
      // Return memoized value, the dependencies are keeping it up to date.
      return state.value as ExtractPlumValue<TPlum>;
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
      return state.value as ExtractPlumValue<TPlum>;
    }

    return this._recompute(plum) as ExtractPlumValue<TPlum>;
  }

  set<T>(plum: TgpuPlum<T> & TgpuSettable, value: T): void {
    const state = this._getState(plum);

    if (Object.is(state.value, value)) {
      // Value is the same as before, aborting.
      return;
    }

    state.value = value;
    state.version++;

    this._notifyListeners(plum);
  }

  subscribe<T>(plum: TgpuPlum<T>, listener: PlumListener<T>): Unsubscribe {
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
