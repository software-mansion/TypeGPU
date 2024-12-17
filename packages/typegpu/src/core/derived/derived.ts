import type { TgpuDerived } from './derivedTypes';

// ----------
// Public API
// ----------

export function derived<T>(compute: () => T) {
  return new TgpuDerivedImpl(compute);
}

// --------------
// Implementation
// --------------

class TgpuDerivedImpl<T> implements TgpuDerived<T> {
  readonly resourceType = 'derived';

  constructor(private readonly _compute: () => T) {}

  compute(): T {
    // TODO: Cache
    return this._compute();
  }
}
