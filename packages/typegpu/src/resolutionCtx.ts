import { MissingSlotValueError, ResolutionError } from './errors';
import { onGPU } from './gpuMode';
import type { JitTranspiler } from './jitTranspiler';
import type { NameRegistry } from './nameRegistry';
import { code } from './tgpuCode';
import type { TgpuFn } from './tgpuFn';
import { isTextureView } from './tgpuTexture';
import type { TgpuIdentifier } from './types';
import type {
  AnyTgpuData,
  BufferUsage,
  Eventual,
  ResolutionCtx,
  SlotValuePair,
  TgpuBindable,
  TgpuRenderResource,
  TgpuResolvable,
  TgpuSlot,
  Wgsl,
} from './types';
import {
  isDepthTextureType,
  isExternalTextureType,
  isResolvable,
  isSamplerType,
  isSlot,
} from './types';

export type ResolutionCtxImplOptions = {
  readonly names: NameRegistry;
  readonly bindingGroup?: number;
  readonly jitTranspiler?: JitTranspiler | undefined;
};

type SlotToValueMap = Map<TgpuSlot<unknown>, unknown>;

const usageToVarTemplateMap: Record<Exclude<BufferUsage, 'vertex'>, string> = {
  uniform: 'uniform',
  mutable: 'storage, read_write',
  readonly: 'storage, read',
};

class SharedResolutionState {
  private _nextFreeBindingIdx = 0;
  private _nextFreeVertexBindingIdx = 0;
  private readonly _usedBindables = new Set<TgpuBindable>();
  private readonly _usedRenderResources = new Set<TgpuRenderResource>();
  private readonly _resourceToIndexMap = new WeakMap<
    TgpuRenderResource | TgpuBindable,
    number
  >();
  private readonly _vertexBufferToIndexMap = new WeakMap<
    TgpuBindable,
    number
  >();
  private readonly _usedBuiltins = new Set<symbol>();
  private readonly _declarations: string[] = [];

  constructor(
    public readonly names: NameRegistry,
    private readonly _bindingGroup: number,
    public readonly jitTranspiler: JitTranspiler | undefined,
  ) {}

  get usedBindables(): Iterable<TgpuBindable> {
    return this._usedBindables;
  }

  get usedRenderResources(): Iterable<TgpuRenderResource> {
    return this._usedRenderResources;
  }

  get declarations(): Iterable<string> {
    return this._declarations;
  }

  get usedBuiltins(): Iterable<symbol> {
    return this._usedBuiltins;
  }

  reserveBindingEntry(bindable: TgpuBindable) {
    this._usedBindables.add(bindable);
    const nextIdx = this._nextFreeBindingIdx++;
    this._resourceToIndexMap.set(bindable, nextIdx);

    return { group: this._bindingGroup, idx: nextIdx };
  }

  registerVertexEntry(bindable: TgpuBindable) {
    this._usedBindables.add(bindable);
    const nextIdx = this._nextFreeVertexBindingIdx++;
    this._vertexBufferToIndexMap.set(bindable, nextIdx);
  }

  reserveRenderResourceEntry(resource: TgpuRenderResource) {
    this._usedRenderResources.add(resource);
    const nextIdx = this._nextFreeBindingIdx++;
    this._resourceToIndexMap.set(resource, nextIdx);

    return { group: this._bindingGroup, idx: nextIdx };
  }

  getBindingIndex(resource: TgpuRenderResource | TgpuBindable) {
    return this._resourceToIndexMap.get(resource);
  }

  addDeclaration(declaration: string) {
    this._declarations.push(declaration);
  }

  addBuiltin(builtin: symbol) {
    this._usedBuiltins.add(builtin);
  }
}

type ItemLayer = {
  type: 'item';
  usedSlots: Set<TgpuSlot<unknown>>;
};

type SlotBindingLayer = {
  type: 'slotBinding';
  bindingMap: WeakMap<TgpuSlot<unknown>, unknown>;
};

class ItemStateStack {
  private _stack: (ItemLayer | SlotBindingLayer)[] = [];
  private _itemDepth = 0;

  get itemDepth(): number {
    return this._itemDepth;
  }

  get topItem(): ItemLayer {
    const state = this._stack[this._stack.length - 1];
    if (!state || state.type !== 'item') {
      throw new Error('Internal error, expected item layer to be on top.');
    }
    return state;
  }

  pushItem() {
    this._itemDepth++;
    this._stack.push({
      type: 'item',
      usedSlots: new Set(),
    });
  }

  pushSlotBindings(pairs: SlotValuePair<unknown>[]) {
    this._stack.push({
      type: 'slotBinding',
      bindingMap: new WeakMap(pairs),
    });
  }

  pop() {
    const layer = this._stack.pop();
    if (layer?.type === 'item') {
      this._itemDepth--;
    }
  }

  readSlot<T>(slot: TgpuSlot<T>): T {
    for (let i = this._stack.length - 1; i >= 0; --i) {
      const layer = this._stack[i];
      if (layer?.type === 'item') {
        // Binding not available yet, so this layer is dependent on the slot's value.
        layer.usedSlots.add(slot);
      } else if (layer?.type === 'slotBinding') {
        const boundValue = layer.bindingMap.get(slot);

        if (boundValue !== undefined) {
          return boundValue as T;
        }
      } else {
        throw new Error('Unknown layer type.');
      }
    }

    if (slot.defaultValue === undefined) {
      throw new MissingSlotValueError(slot);
    }

    return slot.defaultValue;
  }
}

export class ResolutionCtxImpl implements ResolutionCtx {
  private readonly _memoizedResolves = new WeakMap<
    // WeakMap because if the resolvable does not exist anymore,
    // apart from this map, there is no way to access the cached value anyway.
    TgpuResolvable,
    { slotToValueMap: SlotToValueMap; result: string }[]
  >();

  private readonly _shared: SharedResolutionState;

  private _itemStateStack = new ItemStateStack();

  constructor(opts: ResolutionCtxImplOptions) {
    this._shared = new SharedResolutionState(
      opts.names,
      opts.bindingGroup ?? 0,
      opts.jitTranspiler,
    );
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

  addDeclaration(declaration: TgpuResolvable): void {
    this._shared.addDeclaration(this.resolve(declaration));
  }

  addBinding(bindable: TgpuBindable, identifier: TgpuIdentifier): void {
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
    resource: TgpuRenderResource,
    identifier: TgpuIdentifier,
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

  addBuiltin(builtin: symbol): void {
    this._shared.addBuiltin(builtin);
  }

  nameFor(item: TgpuResolvable): string {
    return this._shared.names.nameFor(item);
  }

  readSlot<T>(slot: TgpuSlot<T>): T {
    return this._itemStateStack.readSlot(slot);
  }

  unwrap<T>(eventual: Eventual<T>): T {
    let maybeSlot = eventual;

    // Unwrapping all layers of slots.
    while (isSlot(maybeSlot)) {
      maybeSlot = this.readSlot(maybeSlot);
    }

    return maybeSlot;
  }

  /**
   * @param item The item whose resolution should be either retrieved from the cache (if there is a cache hit), or resolved
   * with the `compute` method.
   * @param compute Returns the resolved item and the corresponding bindingMap. This result will be discarded if a sufficient cache entry is found.
   */
  _getOrInstantiate(item: TgpuResolvable): string {
    // All memoized versions of `item`
    const instances = this._memoizedResolves.get(item) ?? [];

    this._itemStateStack.pushItem(); // -- slot reads during this test are treated as uses, but discarded anyway.
    try {
      for (const instance of instances) {
        const slotValuePairs = [...instance.slotToValueMap.entries()];

        if (
          slotValuePairs.every(
            ([slot, expectedValue]) => this.readSlot(slot) === expectedValue,
          )
        ) {
          return instance.result;
        }
      }
    } finally {
      this._itemStateStack.pop(); // -- discarded here.
    }

    // If we got here, no item with the given slot-to-value combo exists in cache yet
    let result: string;

    this._itemStateStack.pushItem();
    try {
      result = item.resolve(this);

      // We know which slots the item used while resolving
      const slotToValueMap = new Map<TgpuSlot<unknown>, unknown>();
      for (const usedSlot of this._itemStateStack.topItem.usedSlots) {
        slotToValueMap.set(usedSlot, this.readSlot(usedSlot));
      }

      instances.push({ slotToValueMap, result });
      this._memoizedResolves.set(item, instances);
    } catch (err) {
      if (err instanceof ResolutionError) {
        throw err.appendToTrace(item);
      }

      throw new ResolutionError(err, [item]);
    } finally {
      this._itemStateStack.pop();
    }

    return result;
  }

  resolve(item: Wgsl, slotValueOverrides: SlotValuePair<unknown>[] = []) {
    if (!isResolvable(item)) {
      return String(item);
    }

    this._itemStateStack.pushSlotBindings(slotValueOverrides);

    try {
      if (this._itemStateStack.itemDepth === 0) {
        const result = onGPU(() => this._getOrInstantiate(item));
        return `${[...this._shared.declarations].join('\n\n')}${result}`;
      }

      return this._getOrInstantiate(item);
    } finally {
      this._itemStateStack.pop();
    }
  }

  transpileFn(
    // biome-ignore lint/suspicious/noExplicitAny: <no generic magic needed>
    fn: TgpuFn<any, AnyTgpuData>,
    externalMap: Record<string, Wgsl>,
  ): { head: Wgsl; body: Wgsl } {
    if (!this._shared.jitTranspiler) {
      throw new Error(
        'Tried to execute a tgpu.fn function without providing a JIT transpiler, or transpiling at build time.',
      );
    }

    return this._shared.jitTranspiler.transpileFn(
      String(fn.body),
      fn.shell.argTypes,
      fn.shell.returnType,
      externalMap,
    );
  }

  getIndexFor(item: TgpuBindable | TgpuRenderResource) {
    const index = this._shared.getBindingIndex(item);
    if (index === undefined) {
      throw new Error('No index found for item');
    }
    return index;
  }
}
