/**
 * Caches results of the function passed in as
 * the argument to the constructor.
 *
 * If the key can be garbage collected, it will be.
 */
export class WeakMemo<TKey extends object, TValue, TArgs extends unknown[]> {
  readonly #map = new WeakMap<TKey, TValue>();
  readonly #make: (key: TKey, ...args: TArgs) => TValue;

  constructor(make: (key: TKey, ...args: TArgs) => TValue) {
    this.#make = make;
  }

  getOrMake(key: TKey, ...args: TArgs): TValue {
    if (this.#map.has(key)) {
      return this.#map.get(key) as TValue;
    }

    const value = this.#make(key, ...args);
    this.#map.set(key, value);
    return value;
  }
}
