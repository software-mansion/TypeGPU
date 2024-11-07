import type { TgpuLaidOut } from './core/bindGroup/laidOut';
import type { TgpuFnShellBase } from './core/function/fnCore';
import { MissingSlotValueError, ResolutionError, invariant } from './errors';
import { onGPU } from './gpuMode';
import type { JitTranspiler } from './jitTranspiler';
import type { NameRegistry } from './nameRegistry';
import { type Block, generateFunction } from './smol';
import type { TgpuBindGroupLayout } from './tgpuBindGroupLayout';
import { code } from './tgpuCode';
import { isTextureView } from './tgpuTexture';
import type {
  AnyTgpuData,
  BufferUsage,
  Eventual,
  ResolutionCtx,
  Resource,
  SlotValuePair,
  TgpuIdentifier,
  TgpuRenderResource,
  TgpuResolvable,
  TgpuSlot,
  Wgsl,
} from './types';
import {
  UnknownData,
  isDepthTextureType,
  isExternalTextureType,
  isResolvable,
  isSamplerType,
  isSlot,
} from './types';

/**
 * Inserted into bind group entry definitions that belong
 * to the automatically generated catch-all bind group.
 *
 * A non-occupied group index can only be determined after
 * every resource has been resolved, so this acts as a placeholder
 * to be replaced with an actual numeric index at the very end
 * of the resolution process.
 */
const CATCHALL_BIND_GROUP_IDX_MARKER = '#CATCHALL#';

export type ResolutionCtxImplOptions = {
  readonly names: NameRegistry;
  readonly jitTranspiler?: JitTranspiler | undefined;
};

type SlotToValueMap = Map<TgpuSlot<unknown>, unknown>;

const usageToVarTemplateMap: Record<Exclude<BufferUsage, 'vertex'>, string> = {
  uniform: 'uniform',
  mutable: 'storage, read_write',
  readonly: 'storage, read',
};

class SharedResolutionState {
  private readonly _usedBuiltins = new Set<symbol>();
  private readonly _declarations: string[] = [];

  constructor(
    public readonly names: NameRegistry,
    public readonly jitTranspiler: JitTranspiler | undefined,
  ) {}

  get declarations(): Iterable<string> {
    return this._declarations;
  }

  get usedBuiltins(): Iterable<symbol> {
    return this._usedBuiltins;
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

type FunctionScopeLayer = {
  type: 'functionScope';
  args: Resource[];
  externalMap: Record<string, unknown>;
  returnType: AnyTgpuData | undefined;
};

type BlockScopeLayer = {
  type: 'blockScope';
  declarations: Map<string, AnyTgpuData | UnknownData>;
};

class ItemStateStack {
  private _stack: (
    | ItemLayer
    | SlotBindingLayer
    | FunctionScopeLayer
    | BlockScopeLayer
  )[] = [];
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

  pushFunctionScope(
    args: Resource[],
    returnType: AnyTgpuData | undefined,
    externalMap: Record<string, unknown>,
  ) {
    this._stack.push({
      type: 'functionScope',
      args,
      returnType,
      externalMap,
    });
  }

  pop() {
    const layer = this._stack.pop();
    if (layer?.type === 'item') {
      this._itemDepth--;
    }
  }

  readSlot<T>(slot: TgpuSlot<T>): T | undefined {
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
      } else if (
        layer?.type === 'functionScope' ||
        layer?.type === 'blockScope'
      ) {
        // Skip
      } else {
        throw new Error('Unknown layer type.');
      }
    }

    return slot.defaultValue;
  }

  getResourceById(id: string): Resource | undefined {
    for (let i = this._stack.length - 1; i >= 0; --i) {
      const layer = this._stack[i];

      if (layer?.type === 'functionScope') {
        const arg = layer.args.find((a) => a.value === id);
        if (arg !== undefined) {
          return arg;
        }

        const external = layer.externalMap[id];
        if (external !== undefined) {
          // TODO: Extract the type of the external value.
          return { value: external, dataType: UnknownData };
        }
      } else if (layer?.type === 'blockScope') {
        const declarationType = layer.declarations.get(id);
        if (declarationType !== undefined) {
          return { value: id, dataType: declarationType };
        }
      } else {
        // Skip
      }
    }

    return undefined;
  }
}

const INDENT = [
  '', // 0
  '  ', // 1
  '    ', // 2
  '      ', // 3
  '        ', // 4
  '          ', // 5
  '            ', // 6
  '              ', // 7
  '                ', // 8
];

const N = INDENT.length - 1;

export class IndentController {
  private identLevel = 0;

  get pre(): string {
    return (
      INDENT[this.identLevel] ??
      (INDENT[N] as string).repeat(this.identLevel / N) +
        INDENT[this.identLevel % N]
    );
  }

  indent(): string {
    const str = this.pre;
    this.identLevel++;
    return str;
  }

  dedent(): string {
    this.identLevel--;
    return this.pre;
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
  private readonly _indentController = new IndentController();

  // -- Bindings
  /**
   * A map from registered bind group layouts to random strings put in
   * place of their group index. The whole tree has to be traversed to
   * collect every use of a typed bind group layout, since they can be
   * explicitly imposed group indices, and they cannot collide.
   */
  private readonly _bindGroupLayoutsToPlaceholderMap = new WeakMap<
    TgpuBindGroupLayout,
    string
  >();
  private _nextFreeLayoutPlaceholderIdx = 0;
  private _nextFreeCatchallBindingIdx = 0;
  private readonly _boundToIndexMap = new WeakMap<object, number>();
  // --

  private _itemStateStack = new ItemStateStack();

  constructor(opts: ResolutionCtxImplOptions) {
    this._shared = new SharedResolutionState(opts.names, opts.jitTranspiler);
  }

  get usedBuiltins() {
    return this._shared.usedBuiltins;
  }

  get pre(): string {
    return this._indentController.pre;
  }

  indent(): string {
    return this._indentController.indent();
  }

  dedent(): string {
    return this._indentController.dedent();
  }

  getById(id: string): Resource {
    // TODO: Provide access to external values
    // TODO: Provide data type information
    return (
      this._itemStateStack.getResourceById(id) ?? {
        value: id,
        dataType: UnknownData,
      }
    );
  }

  transpileFn(fn: string): {
    argNames: string[];
    body: Block;
    externalNames: string[];
  } {
    if (!this._shared.jitTranspiler) {
      throw new Error(
        'Tried to execute a tgpu.fn function without providing a JIT transpiler, or transpiling at build time.',
      );
    }

    return this._shared.jitTranspiler.transpileFn(fn);
  }

  fnToWgsl(
    // biome-ignore lint/suspicious/noExplicitAny: <no need for generic magic>
    shell: TgpuFnShellBase<any, AnyTgpuData>,
    argNames: string[],
    body: Block,
    externalMap: Record<string, unknown>,
  ): { head: Wgsl; body: Wgsl } {
    const args: { value: string; dataType: AnyTgpuData }[] = argNames.map(
      (name, idx) => ({
        value: name,
        dataType: shell.argTypes[idx],
      }),
    );

    this._itemStateStack.pushFunctionScope(args, shell.returnType, externalMap);
    const str = generateFunction(this, body);
    this._itemStateStack.pop();

    const argList = args
      .map((arg) => `${arg.value}: ${this.resolve(arg.dataType)}`)
      .join(', ');

    return {
      head:
        shell.returnType !== undefined
          ? `(${argList}) -> ${this.resolve(shell.returnType)}`
          : `(${argList})`,
      body: str,
    };
  }

  addDeclaration(declaration: TgpuResolvable): void {
    this._shared.addDeclaration(this.resolve(declaration));
  }

  private _reserveBindingEntry(bound: object) {
    const nextIdx = this._nextFreeCatchallBindingIdx++;
    this._boundToIndexMap.set(bound, nextIdx);
    return nextIdx;
  }

  registerLaidOut(laidOut: TgpuLaidOut): string {
    const memoMap = this._bindGroupLayoutsToPlaceholderMap;
    let placeholderKey = memoMap.get(laidOut.layout);

    if (!placeholderKey) {
      placeholderKey = `#BIND_GROUP_LAYOUT_${this._nextFreeLayoutPlaceholderIdx++}#`;
      memoMap.set(laidOut.layout, placeholderKey);
    }

    return placeholderKey;
  }

  registerBindable(resource: object): { group: string; binding: number } {
    const nextIdx = this._nextFreeCatchallBindingIdx++;
    this._boundToIndexMap.set(resource, nextIdx);

    return {
      group: CATCHALL_BIND_GROUP_IDX_MARKER,
      binding: nextIdx,
    };
  }

  registerRenderResource(
    resource: TgpuRenderResource,
    identifier: TgpuIdentifier,
  ): void {
    this._usedRenderResources.add(resource);
    const group = CATCHALL_BIND_GROUP_IDX_MARKER;
    const idx = this._reserveBindingEntry(resource);

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
    const value = this._itemStateStack.readSlot(slot);

    if (value === undefined) {
      throw new MissingSlotValueError(slot);
    }

    return value;
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
   * @param item The item whose resolution should be either retrieved from the cache (if there is a cache hit), or resolved.
   */
  _getOrInstantiate(item: TgpuResolvable): string {
    // All memoized versions of `item`
    const instances = this._memoizedResolves.get(item) ?? [];

    this._itemStateStack.pushItem();

    try {
      for (const instance of instances) {
        const slotValuePairs = [...instance.slotToValueMap.entries()];

        if (
          slotValuePairs.every(
            ([slot, expectedValue]) =>
              this._itemStateStack.readSlot(slot) === expectedValue,
          )
        ) {
          return instance.result;
        }
      }

      // If we got here, no item with the given slot-to-value combo exists in cache yet
      const result = item.resolve(this);

      // We know which slots the item used while resolving
      const slotToValueMap = new Map<TgpuSlot<unknown>, unknown>();
      for (const usedSlot of this._itemStateStack.topItem.usedSlots) {
        slotToValueMap.set(usedSlot, this._itemStateStack.readSlot(usedSlot));
      }

      instances.push({ slotToValueMap, result });
      this._memoizedResolves.set(item, instances);

      return result;
    } catch (err) {
      if (err instanceof ResolutionError) {
        throw err.appendToTrace(item);
      }

      throw new ResolutionError(err, [item]);
    } finally {
      this._itemStateStack.pop();
    }
  }

  resolve(item: Wgsl, slotValueOverrides: SlotValuePair<unknown>[] = []) {
    if (!isResolvable(item)) {
      return String(item);
    }

    let pushedLayer = false;
    if (slotValueOverrides.length > 0) {
      pushedLayer = true;
      this._itemStateStack.pushSlotBindings(slotValueOverrides);
    }

    try {
      if (this._itemStateStack.itemDepth === 0) {
        const result = onGPU(() => this._getOrInstantiate(item));
        return `${[...this._shared.declarations].join('\n\n')}${result}`;
      }

      return this._getOrInstantiate(item);
    } finally {
      if (pushedLayer) {
        this._itemStateStack.pop();
      }
    }
  }

  getIndexFor(item: object) {
    const index = this._boundToIndexMap.get(item);
    invariant(index !== undefined, 'No index found for item');

    return index;
  }
}
