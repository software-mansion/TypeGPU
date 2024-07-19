import { MissingSlotValueError } from './errors';
import type { NameRegistry } from './nameRegistry';
import {
  type BufferUsage,
  type ResolutionCtx,
  type SlotValuePair,
  type Wgsl,
  type WgslBufferBindable,
  type WgslResolvable,
  type WgslSlot,
  isResolvable,
} from './types';
import { code } from './wgslCode';

export type ResolutionCtxImplOptions = {
  readonly names: NameRegistry;
  readonly bindingGroup?: number;
};

type SlotToValueMap = Map<WgslSlot<unknown>, unknown>;

const usageToVarTemplateMap: Record<BufferUsage, string> = {
  uniform: 'uniform',
  mutable_storage: 'storage, read_write',
  readonly_storage: 'storage, read',
};

class ResolutionCache {
  private readonly _memoizedResolves = new WeakMap<
    // WeakMap because if the resolvable does not exist anymore,
    // apart from this map, there is no way to access the cached value anyway.
    WgslResolvable,
    { slotToValueMap: SlotToValueMap; result: string }[]
  >();

  private _nextFreeBindingIdx = 0;
  private readonly _usedBindables = new Set<WgslBufferBindable>();
  private readonly _declarations: string[] = [];

  constructor(private readonly _bindingGroup: number) {}

  get usedBindables(): Iterable<WgslBufferBindable> {
    return this._usedBindables;
  }

  get declarations(): Iterable<string> {
    return this._declarations;
  }

  /**
   * @param item The item whose resolution should be either retrieved from the cache (if there is a cache hit), or resolved
   * with the `compute` method.
   * @param compute Returns the resolved item and the corresponding bindingMap. This result will be discarded if a sufficient cache entry is found.
   */
  getOrInstantiate(item: WgslResolvable, itemCtx: ResolutionCtx): string {
    // All memoized versions of `item`
    const instances = this._memoizedResolves.get(item) ?? [];

    for (const instance of instances) {
      const slotValuePairs = [...instance.slotToValueMap.entries()];

      if (
        slotValuePairs.every(
          ([slot, expectedValue]) => itemCtx.readSlot(slot) === expectedValue,
        )
      ) {
        return instance.result;
      }
    }

    // If we got here, no item with the given slot-to-value combo exists in cache yet
    const result = item.resolve(itemCtx);

    // We know which bindables the item used while resolving
    const slotToValueMap = new Map<WgslSlot<unknown>, unknown>();
    for (const usedSlot of itemCtx.usedSlots) {
      slotToValueMap.set(usedSlot, itemCtx.readSlot(usedSlot));
    }

    instances.push({ slotToValueMap, result });
    this._memoizedResolves.set(item, instances);

    return result;
  }

  reserveBindingEntry(_bindable: WgslBufferBindable) {
    this._usedBindables.add(_bindable);

    return { group: this._bindingGroup, idx: this._nextFreeBindingIdx++ };
  }

  addDeclaration(declaration: string) {
    this._declarations.push(declaration);
  }
}

export class ResolutionCtxImpl implements ResolutionCtx {
  private readonly _names: NameRegistry;
  private readonly _cache: ResolutionCache;

  ancestors: WgslResolvable[] = [];
  usedSlots = new Set<WgslSlot<unknown>>();

  /**
   * @throws {MemoryArenaConflict}
   */
  constructor({ names, bindingGroup }: ResolutionCtxImplOptions) {
    this._names = names;
    this._cache = new ResolutionCache(bindingGroup ?? 0);
  }

  get usedBindables() {
    return this._cache.usedBindables;
  }

  addDeclaration(_declaration: WgslResolvable) {
    throw new Error('Call ctx.resolve(item) instead of item.resolve(ctx)');
  }

  addBinding(_bindable: WgslBufferBindable): void {
    throw new Error('Call ctx.resolve(item) instead of item.resolve(ctx)');
  }

  nameFor(item: WgslResolvable): string {
    return this._names.nameFor(item);
  }

  readSlot<T>(slot: WgslSlot<T>): T {
    if (slot.defaultValue === undefined) {
      throw new MissingSlotValueError(slot);
    }

    return slot.defaultValue;
  }

  resolve(item: Wgsl, slotValueOverrides: SlotValuePair<unknown>[] = []) {
    if (!isResolvable(item)) {
      return String(item);
    }

    const itemCtx = new ScopedResolutionCtx(
      this,
      this._cache,
      slotValueOverrides,
    );
    const result = this._cache.getOrInstantiate(item, itemCtx);

    return `${[...this._cache.declarations].join('\n\n')}${result}`;
  }
}

class ScopedResolutionCtx implements ResolutionCtx {
  readonly ancestors: WgslResolvable[];
  usedSlots = new Set<WgslSlot<unknown>>();

  constructor(
    private readonly _parent: ResolutionCtxImpl | ScopedResolutionCtx,
    private readonly _cache: ResolutionCache,
    private readonly _slotValuePairs: SlotValuePair<unknown>[],
  ) {
    this.ancestors = [..._parent.ancestors, _parent];
  }

  addDeclaration(declaration: WgslResolvable): void {
    this._cache.addDeclaration(this.resolve(declaration));
  }

  addBinding(bindable: WgslBufferBindable): void {
    const { group, idx } = this._cache.reserveBindingEntry(bindable);

    this.addDeclaration(
      code`@group(${group}) @binding(${idx}) var<${usageToVarTemplateMap[bindable.usage]}> ${bindable}: ${bindable.allocatable.dataType};`,
    );
  }

  nameFor(token: WgslResolvable): string {
    return this._parent.nameFor(token);
  }

  readSlot<T>(slot: WgslSlot<T>): T {
    const slotToValuePair = this._slotValuePairs.find(
      ([boundSlot]) => boundSlot === slot,
    ) as SlotValuePair<T> | undefined;

    if (!slotToValuePair) {
      // Not yet available locally, ctx's owner resolvable depends on `slot`.
      this.usedSlots.add(slot);
      // Maybe the parent ctx has it.
      return this._parent.readSlot(slot);
    }

    // Available locally, ctx's owner resolvable depends on `slot`.
    this.usedSlots.add(slot);
    return slotToValuePair[1];
  }

  resolve(item: Wgsl, slotValueOverrides: SlotValuePair<unknown>[] = []) {
    if (!isResolvable(item)) {
      return String(item);
    }

    const itemCtx = new ScopedResolutionCtx(
      this,
      this._cache,
      slotValueOverrides,
    );
    return this._cache.getOrInstantiate(item, itemCtx);
  }
}
