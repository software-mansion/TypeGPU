import { MissingBindingError } from './errors';
import type { NameRegistry } from './nameRegistry';
import {
  type BindPair,
  type BufferUsage,
  type ResolutionCtx,
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

type BindingMap = Map<WgslSlot<unknown>, unknown>;

const usageToVarTemplateMap: Record<BufferUsage, string> = {
  uniform: 'uniform',
  mutable_storage: 'storage, read_write',
  readonly_storage: 'storage, read',
};

class ResolutionCache {
  private readonly _memoizedResults = new WeakMap<
    // WeakMap because if the resolvable does not exist anymore,
    // apart from this map, there is no way to access the cached value anyway.
    WgslResolvable,
    { bindingMap: BindingMap; result: string }[]
  >();

  private _nextFreeBindingIdx = 0;
  public readonly usedBindables = new Set<WgslBufferBindable>();

  constructor(private readonly _bindingGroup: number) {}

  /**
   * @param item The item whose resolution should be either retrieved from the cache (if there is a cache hit), or resolved
   * with the `compute` method.
   * @param compute Returns the resolved item and the corresponding bindingMap. This result will be discarded if a sufficient cache entry is found.
   */
  get(
    item: WgslResolvable,
    readSlot: <T>(slot: WgslSlot<T>) => T,
    compute: () => {
      result: string;
      bindingMap: Map<WgslSlot<unknown>, unknown>;
    },
  ): { result: string; cacheHit: boolean } {
    // All memoized versions of `item`
    const memoizedEntries = this._memoizedResults.get(item) ?? [];

    for (const memoizedEntry of memoizedEntries) {
      const bindPairs = [...memoizedEntry.bindingMap.entries()];
      if (
        bindPairs.every(
          ([slot, expectedValue]) => readSlot(slot) === expectedValue,
        )
      ) {
        return { result: memoizedEntry.result, cacheHit: true };
      }
    }

    // If we got here, no item with the given bindings exists in cache yet
    const { result, bindingMap } = compute();

    memoizedEntries.push({ bindingMap, result });
    this._memoizedResults.set(item, memoizedEntries);

    return { result, cacheHit: false };
  }

  reserveBindingEntry(_bindable: WgslBufferBindable) {
    this.usedBindables.add(_bindable);
    return { group: this._bindingGroup, idx: this._nextFreeBindingIdx++ };
  }
}

export class ResolutionCtxImpl implements ResolutionCtx {
  private readonly _names: NameRegistry;
  private readonly _cache: ResolutionCache;
  private readonly _declarations = new Set<string>();

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

  recordDeclarations(declarations: Iterable<string>) {
    for (const decl of declarations) {
      this._declarations.add(decl);
    }
  }

  readSlot<T>(slot: WgslSlot<T>): T {
    if (slot.defaultValue === undefined) {
      throw new MissingBindingError(slot);
    }

    return slot.defaultValue;
  }

  resolve(item: Wgsl, localBindings: BindPair<unknown>[] = []) {
    if (!isResolvable(item)) {
      return String(item);
    }

    const itemCtx = new ScopedResolutionCtx(this, this._cache, localBindings);
    const { result, cacheHit } = this._cache.get(
      item,
      (slot) => itemCtx.readSlot(slot),
      () => {
        const result = item.resolve(itemCtx);

        // We know which bindables the item used while resolving
        const bindingMap = new Map<WgslSlot<unknown>, unknown>();
        for (const usedSlot of itemCtx.usedSlots) {
          bindingMap.set(usedSlot, itemCtx.readSlot(usedSlot));
        }

        return { result, bindingMap };
      },
    );

    // Only adding declarations of those items that did not exist in the cache already
    if (!cacheHit) {
      this.recordDeclarations(itemCtx.declarations);
    }

    return `${[...this._declarations.values()].join('\n\n')}${result}`;
  }
}

class ScopedResolutionCtx implements ResolutionCtx {
  readonly ancestors: WgslResolvable[];
  usedSlots = new Set<WgslSlot<unknown>>();

  public readonly declarations: string[] = [];

  constructor(
    private readonly _parent: ResolutionCtxImpl | ScopedResolutionCtx,
    private readonly _cache: ResolutionCache,
    private readonly _bindings: BindPair<unknown>[],
  ) {
    this.ancestors = [..._parent.ancestors, _parent];
  }

  addDeclaration(declaration: WgslResolvable): void {
    this.declarations.push(this.resolve(declaration));
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

  recordDeclarations(declarations: Iterable<string>) {
    this._parent.recordDeclarations(declarations);
  }

  readSlot<T>(slot: WgslSlot<T>): T {
    const bindPair = this._bindings.find(([boundSlot]) => boundSlot === slot) as
      | BindPair<T>
      | undefined;

    if (!bindPair) {
      // Not yet available locally, ctx's owner resolvable depends on `slot`.
      this.usedSlots.add(slot);
      // Maybe the parent ctx has it.
      return this._parent.readSlot(slot);
    }

    // Available locally, ctx's owner resolvable depends on `slot`.
    this.usedSlots.add(slot);
    return bindPair[1];
  }

  resolve(item: Wgsl, localBindings: BindPair<unknown>[] = []) {
    if (!isResolvable(item)) {
      return String(item);
    }

    const itemCtx = new ScopedResolutionCtx(this, this._cache, localBindings);
    const { result, cacheHit } = this._cache.get(
      item,
      (slot) => itemCtx.readSlot(slot),
      () => {
        const result = item.resolve(itemCtx);

        // We know which bindables the item used while resolving
        const bindingMap = new Map<WgslSlot<unknown>, unknown>();
        for (const usedSlot of itemCtx.usedSlots) {
          bindingMap.set(usedSlot, itemCtx.readSlot(usedSlot));
        }

        return { result, bindingMap };
      },
    );

    // Only adding declarations of those items that did not exist in the cache already
    if (!cacheHit) {
      this.recordDeclarations(itemCtx.declarations);
    }

    return result;
  }
}
