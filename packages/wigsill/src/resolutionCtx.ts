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
  readonly bindings?: BindPair<unknown>[];
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
    compute: () => {
      result: string;
      bindingMap: Map<WgslSlot<unknown>, unknown>;
    },
  ): string {
    // TODO: Decrease redundant `resolves` by checking whether there exists a cache entry whose bindingMap's values are equal in the current context.

    const { result, bindingMap } = compute();

    // All memoized versions of `item`
    const memoizedEntries = this._memoizedResults.get(item) ?? [];

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
        return entry.result;
      }
    }

    // If we got here, no item with the given bindings exists in cache yet
    memoizedEntries.push({ bindingMap, result });
    this._memoizedResults.set(item, memoizedEntries);

    return result;
  }
}

export class ResolutionCtxImpl implements ResolutionCtx {
  private _entryToArenaMap = new WeakMap<WgslAllocatable, MemoryArena>();
  private readonly _names: NameRegistry;
  private readonly _cache = new ResolutionCache();
  private readonly _bindings: BindPair<unknown>[];

  private _declarations = new Set<string>();
  public usedMemoryArenas = new WeakSet<MemoryArena>();
  public memoryArenaDeclarationIdxMap = new WeakMap<MemoryArena, number>();

  /**
   * @throws {MemoryArenaConflict}
   */
  constructor({
    memoryArenas = [],
    bindings = [],
    names,
  }: ResolutionCtxImplOptions) {
    this._bindings = bindings;
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

  addDeclaration(
    declaration: WgslResolvable,
    localBindings?: BindPair<unknown>[],
  ) {
    this.recordDeclaration(this.resolve(declaration, localBindings));
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

  recordUsedSlot(slot: WgslSlot<unknown>) {
    this.usedSlots.add(slot);
  }

  recordDeclaration(declaration: string) {
    this._declarations.add(declaration);
  }

  readSlot<T>(slot: WgslSlot<T>): T {
    const bindPair = this._bindings.find(([boundSlot]) => boundSlot === slot) as
      | BindPair<T>
      | undefined;

    // Recording the fact that `slot` was used
    this.recordUsedSlot(slot);

    if (!bindPair) {
      if (slot.defaultValue === undefined) {
        throw new MissingBindingError(slot);
      }

      return slot.defaultValue;
    }

    return bindPair[1];
  }

  resolve(item: Wgsl, localBindings: BindPair<unknown>[] = []) {
    if (!isResolvable(item)) {
      return String(item);
    }

    const itemCtx = new ScopedResolutionCtx(this, this._cache, localBindings);
    const result = this._cache.get(item, () => {
      const result = item.resolve(itemCtx);

      // We know which bindables the item used while resolving
      const bindingMap = new Map<WgslSlot<unknown>, unknown>();
      for (const usedSlot of itemCtx.usedSlots) {
        bindingMap.set(usedSlot, itemCtx.readSlot(usedSlot));
      }

      return { result, bindingMap };
    });

    return `${result}${[...this._declarations.values()].join('\n\n')}`;
  }
}

class ScopedResolutionCtx implements ResolutionCtx {
  ancestors: WgslResolvable[] = [];
  usedSlots = new Set<WgslSlot<unknown>>();

  constructor(
    private readonly _parent: ResolutionCtxImpl | ScopedResolutionCtx,
    private readonly _cache: ResolutionCache,
    private readonly _bindings: BindPair<unknown>[],
  ) {}

  addDeclaration(
    declaration: WgslResolvable,
    localBindings: BindPair<unknown>[] = [],
  ): void {
    this.recordDeclaration(this.resolve(declaration, localBindings));
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

  recordUsedSlot(slot: WgslSlot<unknown>) {
    this.usedSlots.add(slot);
    this._parent.recordUsedSlot(slot);
  }

  recordDeclaration(declaration: string) {
    this._parent.recordDeclaration(declaration);
  }

  readSlot<T>(slot: WgslSlot<T>): T {
    const bindPair = this._bindings.find(([boundSlot]) => boundSlot === slot) as
      | BindPair<T>
      | undefined;

    this.recordUsedSlot(slot);

    if (!bindPair) {
      // Maybe the parent ctx has it.
      return this._parent.readSlot(slot);
    }

    return bindPair[1];
  }

  resolve(item: Wgsl, localBindings: BindPair<unknown>[] = []) {
    if (!isResolvable(item)) {
      return String(item);
    }

    const itemCtx = new ScopedResolutionCtx(this, this._cache, localBindings);
    const result = this._cache.get(item, () => {
      const result = item.resolve(itemCtx);

      // We know which bindables the item used while resolving
      const bindingMap = new Map<WgslSlot<unknown>, unknown>();
      for (const usedSlot of itemCtx.usedSlots) {
        bindingMap.set(usedSlot, itemCtx.readSlot(usedSlot));
      }

      return { result, bindingMap };
    });

    return result;
  }
}
