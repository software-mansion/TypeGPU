import {
  MemoryArenaConflictError,
  MissingBindingError,
  NotAllocatedMemoryError,
} from './errors';
import type { MemoryArena } from './memoryArena';
import type { NameRegistry } from './nameRegistry';
import {
  type BindPair,
  type ResolutionCtx,
  type Wgsl,
  type WgslAllocatable,
  type WgslResolvable,
  type WgslSlot,
  isResolvable,
} from './types';

export type ResolutionCtxImplOptions = {
  readonly memoryArenas?: MemoryArena[];
  readonly names: NameRegistry;
};

type BindingMap = Map<WgslSlot<unknown>, unknown>;

class ResolutionCache {
  private readonly _memoizedResults = new WeakMap<
    // WeakMap because if the resolvable does not exist anymore,
    // apart from this map, there is no way to access the cached value anyway.
    WgslResolvable,
    { bindingMap: BindingMap; result: string }[]
  >();

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

    const { result, bindingMap } = compute();

    // Check for cache hits
    for (const entry of memoizedEntries) {
      if (entry.bindingMap.size !== bindingMap.size) {
        // Definitely not the same.
        continue;
      }

      const matchesEntry = [...bindingMap.entries()].every(
        ([bindable, value]) =>
          bindable.areEqual(value, entry.bindingMap.get(bindable)),
      );

      if (matchesEntry) {
        // None of the values reported an inequality, return cached value and discard resolution result.
        return { result: entry.result, cacheHit: true };
      }
    }

    // If we got here, no item with the given bindings exists in cache yet
    memoizedEntries.push({ bindingMap, result });
    this._memoizedResults.set(item, memoizedEntries);

    return { result, cacheHit: false };
  }
}

export class ResolutionCtxImpl implements ResolutionCtx {
  private _entryToArenaMap = new WeakMap<WgslAllocatable, MemoryArena>();
  private readonly _names: NameRegistry;
  private readonly _cache = new ResolutionCache();

  private _declarations = new Set<string>();
  public usedMemoryArenas = new WeakSet<MemoryArena>();
  public memoryArenaDeclarationIdxMap = new WeakMap<MemoryArena, number>();

  /**
   * @throws {MemoryArenaConflict}
   */
  constructor({ memoryArenas = [], names }: ResolutionCtxImplOptions) {
    this._names = names;

    for (const arena of memoryArenas) {
      for (const entry of arena.memoryEntries) {
        if (this._entryToArenaMap.has(entry)) {
          throw new MemoryArenaConflictError(entry);
        }

        this._entryToArenaMap.set(entry, arena);
      }
    }
  }

  ancestors: WgslResolvable[] = [];

  usedSlots = new Set<WgslSlot<unknown>>();

  addDeclaration(_declaration: WgslResolvable) {
    throw new Error('Call ctx.resolve(item) instead of item.resolve(ctx)');
  }

  /**
   * @throws {NotAllocatedMemoryError}
   */
  addAllocatable(allocatable: WgslAllocatable): void {
    // TODO: Switch out for actual implementation of arena-less allocation.
    throw new NotAllocatedMemoryError(allocatable);
  }

  nameFor(item: WgslResolvable): string {
    return this._names.nameFor(item);
  }

  arenaFor(memoryEntry: WgslAllocatable): MemoryArena | null {
    return this._entryToArenaMap.get(memoryEntry) ?? null;
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

  addAllocatable(allocatable: WgslAllocatable): void {
    this._parent.addAllocatable(allocatable);
  }

  nameFor(token: WgslResolvable): string {
    return this._parent.nameFor(token);
  }

  arenaFor(memoryEntry: WgslAllocatable): MemoryArena | null {
    return this._parent.arenaFor(memoryEntry);
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
