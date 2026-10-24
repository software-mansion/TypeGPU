import { MissingSlotValueError } from '../../errors.ts';
import { $gpuValueOf, $internal, $providing } from '../../shared/symbols.ts';
import {
  type Eventual,
  isLazy,
  isProviding,
  isSlot,
  type Providing,
  type SlotValuePair,
  type TgpuLazy,
  type TgpuSlot,
} from './slotTypes.ts';

export type SlotToValueMap = Map<TgpuSlot<unknown>, unknown>;

/**
 * The result of computing an item, along with the slot values it was computed with.
 */
export type SlotKeyedInstance<T> = { slotToValueMap: SlotToValueMap; result: T };

/**
 * Every instance of an item, one per combination of slot values it was computed with.
 */
export type InstanceMap<TKey extends object, T> = WeakMap<TKey, SlotKeyedInstance<T>[]>;

type ItemLayer = {
  type: 'item';
  usedSlots: Set<TgpuSlot<unknown>>;
};

type SlotBindingLayer = {
  type: 'slotBinding';
  bindingMap: WeakMap<TgpuSlot<unknown>, unknown>;
};

export interface SlotScopeOptions {
  /**
   * Where instances of computed lazy values are stored.
   */
  readonly lazyInstances: InstanceMap<TgpuLazy<unknown>, unknown>;
  /**
   * Bindings of slots that are not bound in this scope are looked up in the parent scope,
   * before falling back to their default values.
   */
  readonly parent?: SlotScope | undefined;
  /**
   * Called when a lazy value has to be (re)computed. Defaults to computing it directly.
   */
  readonly computeLazy?: (<T>(lazy: TgpuLazy<T>) => T) | undefined;
  /**
   * Called when unwrapping an item with bound slot values (e.g. `lazy.with(slot, value)`).
   * The bindings are already pushed by the time `callback` runs.
   */
  readonly withProviding?:
    | (<T>(item: { [$providing]: Providing }, callback: () => T) => T)
    | undefined;
}

/**
 * Tracks slot bindings, and keeps instances of items (e.g. lazy values) keyed by the slot values
 * they depend on. Used both during resolution, and when executing TypeGPU functions on the CPU.
 */
export class SlotScope {
  readonly #stack: (ItemLayer | SlotBindingLayer)[] = [];
  readonly #options: SlotScopeOptions;
  #itemDepth = 0;

  constructor(options: SlotScopeOptions) {
    this.#options = options;
  }

  get lazyInstances(): InstanceMap<TgpuLazy<unknown>, unknown> {
    return this.#options.lazyInstances;
  }

  get itemDepth(): number {
    return this.#itemDepth;
  }

  #lookupSlot<T>(slot: TgpuSlot<T>): T | undefined {
    for (let i = this.#stack.length - 1; i >= 0; --i) {
      const layer = this.#stack[i] as ItemLayer | SlotBindingLayer;
      if (layer.type === 'item') {
        // Binding not available yet, so this layer is dependent on the slot's value.
        layer.usedSlots.add(slot);
      } else {
        const boundValue = layer.bindingMap.get(slot);

        if (boundValue !== undefined) {
          return boundValue as T;
        }
      }
    }

    return this.#options.parent ? this.#options.parent.#lookupSlot(slot) : slot.defaultValue;
  }

  /**
   * @throws {MissingSlotValueError}
   */
  readSlot<T>(slot: TgpuSlot<T>): T {
    const value = this.#lookupSlot(slot);

    if (value === undefined) {
      throw new MissingSlotValueError(slot);
    }

    return value;
  }

  withSlots<T>(pairs: SlotValuePair[], callback: () => T): T {
    if (pairs.length === 0) {
      return callback();
    }

    this.#stack.push({ type: 'slotBinding', bindingMap: new WeakMap(pairs) });

    try {
      return callback();
    } finally {
      this.#pop('slotBinding');
    }
  }

  /**
   * Returns an existing instance of `key`, if one was computed with the same
   * values of slots it depends on. Otherwise, computes it and stores it in `instances`.
   */
  getOrInstantiate<TKey extends object, T>(
    instances: InstanceMap<TKey, T>,
    key: TKey,
    compute: () => T,
  ): T {
    // All instances of `key`
    const keyInstances = instances.get(key) ?? [];

    this.#stack.push({ type: 'item', usedSlots: new Set() });
    this.#itemDepth++;

    try {
      for (const instance of keyInstances) {
        const slotValuePairs = [...instance.slotToValueMap.entries()];

        if (
          slotValuePairs.every(([slot, expectedValue]) =>
            slot.areEqual(this.#lookupSlot(slot), expectedValue),
          )
        ) {
          return instance.result;
        }
      }

      // If we got here, no instance matches the current slot values
      const result = compute();

      // We know which slots the item used while computing
      const slotToValueMap: SlotToValueMap = new Map();
      for (const usedSlot of (this.#stack[this.#stack.length - 1] as ItemLayer).usedSlots) {
        slotToValueMap.set(usedSlot, this.#lookupSlot(usedSlot));
      }

      keyInstances.push({ slotToValueMap, result });
      instances.set(key, keyInstances);
      return result;
    } finally {
      this.#pop('item');
      this.#itemDepth--;
    }
  }

  /**
   * Unwraps all layers of slot/lazy indirection and returns the concrete value if available.
   * @throws {MissingSlotValueError}
   */
  unwrap<T>(eventual: Eventual<T>): T {
    if (isProviding(eventual)) {
      const withProviding = this.#options.withProviding ?? ((_, callback) => callback());
      return withProviding(eventual, () =>
        this.withSlots(eventual[$providing].pairs, () =>
          this.unwrap(eventual[$providing].inner as Eventual<T>),
        ),
      );
    }

    let maybeEventual = eventual;

    // Unwrapping all layers of slots.
    while (true) {
      if (isSlot(maybeEventual)) {
        maybeEventual = this.readSlot(maybeEventual);
      } else if (isLazy(maybeEventual)) {
        const lazy = maybeEventual;
        maybeEventual = isProviding(lazy)
          ? // Lazy values with bound slot values (e.g. `lazy.with(slot, value)`)
            (this.unwrap(lazy) as typeof maybeEventual)
          : this.getOrInstantiate(
              this.#options.lazyInstances as InstanceMap<TgpuLazy<T>, T>,
              lazy,
              () =>
                this.#options.computeLazy
                  ? this.#options.computeLazy(lazy)
                  : lazy[$internal].compute(),
            );
      } else {
        break;
      }
    }

    return maybeEventual;
  }

  /**
   * Unwraps slots and lazy values, and dereferences resources (constants, variables, ...)
   * to the values they represent. Used when executing on the CPU.
   */
  getValue<T>(value: unknown): T {
    let unwrapped = value;

    while (true) {
      if (isSlot(unwrapped) || isLazy(unwrapped)) {
        unwrapped = this.unwrap(unwrapped);
      } else if (isDereferenceable(unwrapped)) {
        unwrapped = unwrapped.$;
      } else {
        break;
      }
    }

    return unwrapped as T;
  }

  #pop(type: (ItemLayer | SlotBindingLayer)['type']) {
    const layer = this.#stack[this.#stack.length - 1];
    if (!layer || layer.type !== type) {
      throw new Error(`Internal error, expected a ${type} layer to be on top.`);
    }
    this.#stack.pop();
  }
}

function isDereferenceable(value: unknown): value is { $: unknown } {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    $gpuValueOf in value &&
    '$' in value
  );
}
