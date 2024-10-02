/**
 * Caches results of the function passed in as
 * the argument to the constructor.
 *
 * If the key can be garbage collected, it will be.
 */
export class WeakMemo<TKey extends object, TValue, TArgs extends unknown[]> {
  private readonly _map = new WeakMap<TKey, TValue>();

  constructor(private readonly _make: (key: TKey, ...args: TArgs) => TValue) {}

  getOrMake(key: TKey, ...args: TArgs): TValue {
    if (this._map.has(key)) {
      return this._map.get(key) as TValue;
    }

    const value = this._make(key, ...args);
    this._map.set(key, value);
    return value;
  }
}
