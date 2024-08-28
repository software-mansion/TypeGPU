import { MissingSlotValueError, ResolutionError } from '../errors';
import type { NameRegistry } from './nameRegistry';
import type {
  BufferUsage,
  Eventual,
  ResolutionCtx,
  SlotValuePair,
  Wgsl,
  WgslBindable,
  WgslRenderResource,
  WgslResolvable,
  WgslSlot,
} from './types';
import {
  isDepthTextureType,
  isExternalTextureType,
  isResolvable,
  isSamplerType,
  isSlot,
} from './types';
import type { Builtin } from './wgslBuiltin';
import { code } from './wgslCode';
import type { WgslIdentifier } from './wgslIdentifier';
import { isTextureView } from './wgslTexture';

export type ResolutionCtxImplOptions = {
  readonly names: NameRegistry;
  readonly bindingGroup?: number;
};

type SlotToValueMap = Map<WgslSlot<unknown>, unknown>;

const usageToVarTemplateMap: Record<Exclude<BufferUsage, 'vertex'>, string> = {
  uniform: 'uniform',
  mutable: 'storage, read_write',
  readonly: 'storage, read',
};

class SharedResolutionState {
  private readonly _memoizedResolves = new WeakMap<
    // WeakMap because if the resolvable does not exist anymore,
    // apart from this map, there is no way to access the cached value anyway.
    WgslResolvable,
    { slotToValueMap: SlotToValueMap; result: string }[]
  >();

  private _nextFreeBindingIdx = 0;
  private _nextFreeVertexBindingIdx = 0;
  private readonly _usedBindables = new Set<WgslBindable>();
  private readonly _usedRenderResources = new Set<WgslRenderResource>();
  private readonly _resourceToIndexMap = new WeakMap<
    WgslRenderResource | WgslBindable,
    number
  >();
  private readonly _vertexBufferToIndexMap = new WeakMap<
    WgslBindable,
    number
  >();
  private readonly _usedBuiltins = new Set<Builtin>();
  private readonly _declarations: string[] = [];

  constructor(
    public readonly names: NameRegistry,
    private readonly _bindingGroup: number,
  ) {}

  get usedBindables(): Iterable<WgslBindable> {
    return this._usedBindables;
  }

  get usedRenderResources(): Iterable<WgslRenderResource> {
    return this._usedRenderResources;
  }

  get declarations(): Iterable<string> {
    return this._declarations;
  }

  get usedBuiltins(): Iterable<Builtin> {
    return this._usedBuiltins;
  }

  /**
   * @param item The item whose resolution should be either retrieved from the cache (if there is a cache hit), or resolved
   * with the `compute` method.
   * @param compute Returns the resolved item and the corresponding bindingMap. This result will be discarded if a sufficient cache entry is found.
   */
  getOrInstantiate(item: WgslResolvable, itemCtx: ScopedResolutionCtx): string {
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
    let result: string;
    try {
      result = item.resolve(itemCtx);
    } catch (err) {
      if (err instanceof ResolutionError) {
        throw err.appendToTrace(item);
      }

      throw new ResolutionError(err, [item]);
    }

    // We know which bindables the item used while resolving
    const slotToValueMap = new Map<WgslSlot<unknown>, unknown>();
    for (const usedSlot of itemCtx.usedSlots) {
      slotToValueMap.set(usedSlot, itemCtx.readSlot(usedSlot));
    }

    instances.push({ slotToValueMap, result });
    this._memoizedResolves.set(item, instances);

    return result;
  }

  reserveBindingEntry(bindable: WgslBindable) {
    this._usedBindables.add(bindable);
    const nextIdx = this._nextFreeBindingIdx++;
    this._resourceToIndexMap.set(bindable, nextIdx);

    return { group: this._bindingGroup, idx: nextIdx };
  }

  registerVertexEntry(bindable: WgslBindable) {
    this._usedBindables.add(bindable);
    const nextIdx = this._nextFreeVertexBindingIdx++;
    this._vertexBufferToIndexMap.set(bindable, nextIdx);
  }

  reserveRenderResourceEntry(resource: WgslRenderResource) {
    this._usedRenderResources.add(resource);
    const nextIdx = this._nextFreeBindingIdx++;
    this._resourceToIndexMap.set(resource, nextIdx);

    return { group: this._bindingGroup, idx: nextIdx };
  }

  getBindingIndex(resource: WgslRenderResource | WgslBindable) {
    return this._resourceToIndexMap.get(resource);
  }

  addDeclaration(declaration: string) {
    this._declarations.push(declaration);
  }

  addBuiltin(builtin: Builtin) {
    this._usedBuiltins.add(builtin);
  }
}

export class ResolutionCtxImpl implements ResolutionCtx {
  private readonly _shared: SharedResolutionState;

  usedSlots = new Set<WgslSlot<unknown>>();

  constructor({ names, bindingGroup }: ResolutionCtxImplOptions) {
    this._shared = new SharedResolutionState(names, bindingGroup ?? 0);
  }

  get usedBindables() {
    return this._shared.usedBindables;
  }

  get usedRenderResources() {
    return this._shared.usedRenderResources;
  }

  get usedBuiltins() {
    return this._shared.usedBuiltins;
  }

  addDeclaration(_declaration: WgslResolvable) {
    throw new Error('Call ctx.resolve(item) instead of item.resolve(ctx)');
  }

  addBinding(_bindable: WgslBindable, _identifier: WgslIdentifier): void {
    throw new Error('Call ctx.resolve(item) instead of item.resolve(ctx)');
  }

  addRenderResource(
    resource: WgslRenderResource,
    identifier: WgslIdentifier,
  ): void {
    throw new Error('Call ctx.resolve(item) instead of item.resolve(ctx)');
  }

  addBuiltin(builtin: Builtin): void {
    throw new Error('Call ctx.resolve(item) instead of item.resolve(ctx)');
  }

  nameFor(item: WgslResolvable): string {
    return this._shared.names.nameFor(item);
  }

  readSlot<T>(slot: WgslSlot<T>): T {
    if (slot.defaultValue === undefined) {
      throw new MissingSlotValueError(slot);
    }

    return slot.defaultValue;
  }

  unwrap<T>(eventual: Eventual<T>): T {
    throw new Error('Call ctx.resolve(item) instead of item.resolve(ctx)');
  }

  resolve(item: Wgsl, slotValueOverrides: SlotValuePair<unknown>[] = []) {
    if (!isResolvable(item)) {
      return String(item);
    }

    const itemCtx = new ScopedResolutionCtx(
      this,
      this._shared,
      slotValueOverrides,
    );

    const result = this._shared.getOrInstantiate(item, itemCtx);

    return `${[...this._shared.declarations].join('\n\n')}${result}`;
  }

  getIndexFor(item: WgslBindable | WgslRenderResource) {
    const index = this._shared.getBindingIndex(item);
    if (index === undefined) {
      throw new Error('No index found for item');
    }
    return index;
  }
}

class ScopedResolutionCtx implements ResolutionCtx {
  usedSlots = new Set<WgslSlot<unknown>>();

  constructor(
    private readonly _parent: ResolutionCtxImpl | ScopedResolutionCtx,
    private readonly _shared: SharedResolutionState,
    private readonly _slotValuePairs: SlotValuePair<unknown>[],
  ) {}

  addDeclaration(declaration: WgslResolvable): void {
    this._shared.addDeclaration(this.resolve(declaration));
  }

  addBinding(bindable: WgslBindable, identifier: WgslIdentifier): void {
    if (bindable.usage === 'vertex') {
      this._shared.registerVertexEntry(bindable);
      return;
    }
    const { group, idx } = this._shared.reserveBindingEntry(bindable);

    this.addDeclaration(
      code`@group(${group}) @binding(${idx}) var<${usageToVarTemplateMap[bindable.usage]}> ${identifier}: ${bindable.allocatable.dataType};`,
    );
  }

  addRenderResource(
    resource: WgslRenderResource,
    identifier: WgslIdentifier,
  ): void {
    const { group, idx } = this._shared.reserveRenderResourceEntry(resource);

    if (
      isSamplerType(resource.type) ||
      isExternalTextureType(resource.type) ||
      isDepthTextureType(resource.type)
    ) {
      this.addDeclaration(
        code`@group(${group}) @binding(${idx}) var ${identifier}: ${resource.type};`,
      );
      return;
    }

    if (isTextureView(resource)) {
      if (resource.access !== undefined) {
        this.addDeclaration(
          code`@group(${group}) @binding(${idx}) var ${identifier}: ${resource.type}<${resource.texture.descriptor.format}, ${resource.access}>;`,
        );
        return;
      }
      this.addDeclaration(
        code`@group(${group}) @binding(${idx}) var ${identifier}: ${resource.type}<${resource.dataType}>;`,
      );
      return;
    }

    throw new Error(`Unsupported resource type: ${resource.type}`);
  }

  addBuiltin(builtin: Builtin): void {
    this._shared.addBuiltin(builtin);
  }

  nameFor(token: WgslResolvable): string {
    return this._shared.names.nameFor(token);
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

  unwrap<T>(eventual: Eventual<T>): T {
    let maybeSlot = eventual;

    // Unwrapping all layers of slots.
    while (isSlot(maybeSlot)) {
      maybeSlot = this.readSlot(maybeSlot);
    }

    return maybeSlot;
  }

  resolve(
    item: Wgsl,
    slotValueOverrides: SlotValuePair<unknown>[] = [],
  ): string {
    if (!isResolvable(item)) {
      return String(item);
    }

    const itemCtx = new ScopedResolutionCtx(
      this,
      this._shared,
      slotValueOverrides,
    );

    return this._shared.getOrInstantiate(item, itemCtx);
  }
}
