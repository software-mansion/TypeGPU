import type { MemoryArena } from './memoryArena';
import type {
  ResolutionCtx,
  WGSLBindableTrait,
  WGSLItem,
  WGSLMemoryTrait,
  WGSLSegment,
} from './types';

export class BoundResolutionCtx<TBinding> implements ResolutionCtx {
  private readonly _rootCtx: ResolutionCtx;

  constructor(
    private readonly _parentCtx: ResolutionCtx,
    private readonly _bindable: WGSLBindableTrait<TBinding>,
    private readonly _value: TBinding,
  ) {
    // Accessing the root for not-binding related resources, as
    // it is faster than going through each node in the tree.
    this._rootCtx =
      _parentCtx instanceof BoundResolutionCtx
        ? _parentCtx._rootCtx
        : _parentCtx;
  }

  //
  // Fall-through straight to the root
  //

  addDependency(item: WGSLItem): void {
    this._rootCtx.addDependency(item);
  }

  addMemory(memoryEntry: WGSLMemoryTrait): void {
    this._rootCtx.addMemory(memoryEntry);
  }

  nameFor(token: WGSLItem): string {
    return this._rootCtx.nameFor(token);
  }

  arenaFor(memoryEntry: WGSLMemoryTrait): MemoryArena | null {
    return this._rootCtx.arenaFor(memoryEntry);
  }

  resolve(item: WGSLSegment): string {
    return this._rootCtx.resolve(item);
  }

  //
  // Binding specific logic
  //

  requireBinding<T>(bindable: WGSLBindableTrait<T>): T {
    if ((this._bindable as unknown as WGSLBindableTrait<T>) === bindable) {
      return this._value as unknown as T;
    }

    return this._parentCtx.requireBinding(bindable);
  }

  tryBinding<T>(bindable: WGSLBindableTrait<T>, defaultValue: T): T {
    if ((this._bindable as unknown as WGSLBindableTrait<T>) === bindable) {
      return this._value as unknown as T;
    }

    return this._parentCtx.tryBinding(bindable, defaultValue);
  }
}
