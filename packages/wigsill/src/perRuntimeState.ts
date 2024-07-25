import type WigsillRuntime from './wigsillRuntime';

export default class PerRuntimeState<T> {
  private readonly _runtimeToStateMap = new WeakMap<WigsillRuntime, T>();

  constructor(private readonly _make: (runtime: WigsillRuntime) => T) {}

  get(runtime: WigsillRuntime) {
    let state = this._runtimeToStateMap.get(runtime);

    if (!state) {
      state = this._make(runtime);
      this._runtimeToStateMap.set(runtime, state);
    }

    return state;
  }
}
