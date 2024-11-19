import type { Block } from 'tinyest';
import { MissingSlotValueError, ResolutionError } from './errors';
import { onGPU } from './gpuMode';
import type { JitTranspiler } from './jitTranspiler';
import type { NameRegistry } from './nameRegistry';
import { generateFunction } from './smol';
import type { TgpuBindGroupLayout } from './tgpuBindGroupLayout';
import type {
  AnyTgpuData,
  Eventual,
  FnToWgslOptions,
  ResolutionCtx,
  Resource,
  SlotValuePair,
  TgpuResolvable,
  TgpuSlot,
  Wgsl,
} from './types';
import { UnknownData, isResolvable, isSlot } from './types';

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

        // Since functions cannot access resources from the calling scope, we
        // return early here.
        return undefined;
      }

      if (layer?.type === 'blockScope') {
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

  private readonly _indentController = new IndentController();
  private readonly _jitTranspiler: JitTranspiler | undefined;
  private readonly _itemStateStack = new ItemStateStack();
  private readonly _declarations: string[] = [];

  // -- Bindings
  /**
   * A map from registered bind group layouts to random strings put in
   * place of their group index. The whole tree has to be traversed to
   * collect every use of a typed bind group layout, since they can be
   * explicitly imposed group indices, and they cannot collide.
   */
  public readonly bindGroupLayoutsToPlaceholderMap = new Map<
    TgpuBindGroupLayout,
    string
  >();
  private _nextFreeLayoutPlaceholderIdx = 0;
  private _nextFreeCatchallBindingIdx = 0;
  private readonly _boundToIndexMap = new WeakMap<object, number>();
  // --

  public readonly names: NameRegistry;

  constructor(opts: ResolutionCtxImplOptions) {
    this.names = opts.names;
    this._jitTranspiler = opts.jitTranspiler;
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
    if (!this._jitTranspiler) {
      throw new Error(
        'Tried to execute a tgpu.fn function without providing a JIT transpiler, or transpiling at build time.',
      );
    }

    return this._jitTranspiler.transpileFn(fn);
  }

  fnToWgsl(options: FnToWgslOptions): { head: Wgsl; body: Wgsl } {
    this._itemStateStack.pushFunctionScope(
      options.args,
      options.returnType,
      options.externalMap,
    );
    const str = generateFunction(this, options.body);
    this._itemStateStack.pop();

    const argList = options.args
      .map((arg) => `${arg.value}: ${this.resolve(arg.dataType)}`)
      .join(', ');

    return {
      head:
        options.returnType !== undefined
          ? `(${argList}) -> ${this.resolve(options.returnType)}`
          : `(${argList})`,
      body: str,
    };
  }

  addDeclaration(declaration: string): void {
    this._declarations.push(declaration);
  }

  allocateLayoutEntry(layout: TgpuBindGroupLayout): string {
    const memoMap = this.bindGroupLayoutsToPlaceholderMap;
    let placeholderKey = memoMap.get(layout);

    if (!placeholderKey) {
      placeholderKey = `#BIND_GROUP_LAYOUT_${this._nextFreeLayoutPlaceholderIdx++}#`;
      memoMap.set(layout, placeholderKey);
    }

    return placeholderKey;
  }

  allocateFixedEntry(resource: object): { group: string; binding: number } {
    const nextIdx = this._nextFreeCatchallBindingIdx++;
    this._boundToIndexMap.set(resource, nextIdx);

    return {
      group: CATCHALL_BIND_GROUP_IDX_MARKER,
      binding: nextIdx,
    };
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
        return `${[...this._declarations].join('\n\n')}${result}`;
      }

      return this._getOrInstantiate(item);
    } finally {
      if (pushedLayer) {
        this._itemStateStack.pop();
      }
    }
  }
}
