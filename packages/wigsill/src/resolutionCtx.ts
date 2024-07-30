import { MissingSlotValueError } from './errors';
import type { NameRegistry } from './nameRegistry';
import type {
  AnyWgslPrimitive,
  AnyWgslTexelFormat,
  BufferUsage,
  Eventual,
  ResolutionCtx,
  SlotValuePair,
  StorageTextureAccess,
  Wgsl,
  WgslBindable,
  WgslRenderResource,
  WgslRenderResourceType,
  WgslResolvable,
  WgslSlot,
} from './types';
import {
  isDepthTextureType,
  isExternalTextureType,
  isResolvable,
  isSamplerType,
  isSlot,
  isStorageTextureType,
  isTypedTextureType,
} from './types';
import { code } from './wgslCode';
import type { WgslIdentifier } from './wgslIdentifier';
import {
  type WgslStorageTexture,
  type WgslTexture,
  isTextureView,
} from './wgslTexture';

export type ResolutionCtxImplOptions = {
  readonly names: NameRegistry;
  readonly bindingGroup?: number;
};

type SlotToValueMap = Map<WgslSlot<unknown>, unknown>;

const usageToVarTemplateMap: Record<Exclude<BufferUsage, 'vertex'>, string> = {
  uniform: 'uniform',
  mutable_storage: 'storage, read_write',
  readonly_storage: 'storage, read',
};

class SharedResolutionState {
  private readonly _memoizedResolves = new WeakMap<
    // WeakMap because if the resolvable does not exist anymore,
    // apart from this map, there is no way to access the cached value anyway.
    WgslResolvable,
    { slotToValueMap: SlotToValueMap; result: string }[]
  >();

  private _nextFreeBindingIdx = 0;
  private readonly _usedBindables = new Set<WgslBindable>();
  private readonly _usedRenderResources = new Set<
    WgslRenderResource<WgslRenderResourceType>
  >();
  private readonly _declarations: string[] = [];

  constructor(
    public readonly names: NameRegistry,
    private readonly _bindingGroup: number,
  ) {}

  get usedBindables(): Iterable<WgslBindable> {
    return this._usedBindables;
  }

  get usedRenderResources(): Iterable<
    WgslRenderResource<WgslRenderResourceType>
  > {
    return this._usedRenderResources;
  }

  get declarations(): Iterable<string> {
    return this._declarations;
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

  reserveBindingEntry(_bindable: WgslBindable) {
    this._usedBindables.add(_bindable);

    return { group: this._bindingGroup, idx: this._nextFreeBindingIdx++ };
  }

  reserveRenderResourceEntry(
    _resource: WgslRenderResource<WgslRenderResourceType>,
  ) {
    this._usedRenderResources.add(_resource);

    return { group: this._bindingGroup, idx: this._nextFreeBindingIdx++ };
  }

  addDeclaration(declaration: string) {
    this._declarations.push(declaration);
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

  addDeclaration(_declaration: WgslResolvable) {
    throw new Error('Call ctx.resolve(item) instead of item.resolve(ctx)');
  }

  addBinding(_bindable: WgslBindable, _identifier: WgslIdentifier): void {
    throw new Error('Call ctx.resolve(item) instead of item.resolve(ctx)');
  }

  addRenderResource(
    resource: WgslRenderResource<WgslRenderResourceType>,
    identifier: WgslIdentifier,
  ): void {
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
    const { group, idx } = this._shared.reserveBindingEntry(bindable);

    if (bindable.usage === 'vertex') {
      return;
    }

    this.addDeclaration(
      code`@group(${group}) @binding(${idx}) var<${usageToVarTemplateMap[bindable.usage]}> ${identifier}: ${bindable.allocatable.dataType};`,
    );
  }

  addRenderResource(
    resource: WgslRenderResource<WgslRenderResourceType>,
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
      if (isStorageTextureType(resource.type)) {
        const storageTexture = resource.texture as WgslStorageTexture<
          AnyWgslTexelFormat,
          StorageTextureAccess
        >;
        this.addDeclaration(
          code`@group(${group}) @binding(${idx}) var ${identifier}: ${resource.type}<${storageTexture.descriptor.format}, ${storageTexture.access}>;`,
        );
        return;
      }

      if (isTypedTextureType(resource.type)) {
        const typedTexture = resource.texture as WgslTexture<AnyWgslPrimitive>;
        this.addDeclaration(
          code`@group(${group}) @binding(${idx}) var ${identifier}: ${resource.type}<${typedTexture.dataType}>;`,
        );
        return;
      }
    }

    throw new Error(`Unsupported resource type: ${resource.type}`);
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
