import type { Block } from 'tinyest';
import { resolveData } from './core/resolve/resolveData';
import {
  type Eventual,
  type SlotValuePair,
  type TgpuDerived,
  type TgpuSlot,
  isDerived,
  isProviding,
  isSlot,
} from './core/slot/slotTypes';
import { isData } from './data';
import { getAttributesString } from './data/attributes';
import {
  type AnyWgslData,
  type BaseData,
  isWgslArray,
  isWgslStruct,
} from './data/wgslTypes';
import { MissingSlotValueError, ResolutionError } from './errors';
import { RuntimeMode, popMode, provideCtx, pushMode } from './gpuMode';
import type { JitTranspiler } from './jitTranspiler';
import type { NameRegistry } from './nameRegistry';
import { naturalsExcept } from './shared/generators';
import type { Infer } from './shared/repr';
import { generateFunction } from './smol';
import {
  type TgpuBindGroup,
  TgpuBindGroupImpl,
  type TgpuBindGroupLayout,
  type TgpuLayoutEntry,
  bindGroupLayout,
} from './tgpuBindGroupLayout';
import type { FnToWgslOptions, ResolutionCtx, Resource, Wgsl } from './types';
import { UnknownData, isSelfResolvable, isWgsl } from './types';

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
  returnType: AnyWgslData | undefined;
};

type BlockScopeLayer = {
  type: 'blockScope';
  declarations: Map<string, AnyWgslData | UnknownData>;
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
    returnType: AnyWgslData | undefined,
    externalMap: Record<string, unknown>,
  ) {
    this._stack.push({
      type: 'functionScope',
      args,
      returnType,
      externalMap,
    });
  }

  pushBlockScope() {
    this._stack.push({
      type: 'blockScope',
      declarations: new Map<string, AnyWgslData | UnknownData>(),
    });
  }

  popBlockScope() {
    const layer = this._stack.pop();
    if (layer?.type !== 'blockScope') {
      throw new Error('Expected block scope layer to be on top.');
    }
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

  defineBlockVariable(id: string, type: AnyWgslData | UnknownData): Resource {
    for (let i = this._stack.length - 1; i >= 0; --i) {
      const layer = this._stack[i];

      if (layer?.type === 'blockScope') {
        layer.declarations.set(id, type);

        return { value: id, dataType: type };
      }
    }

    throw new Error('No block scope found to define a variable in.');
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

interface FixedBindingConfig {
  layoutEntry: TgpuLayoutEntry;
  resource: object;
}

export class ResolutionCtxImpl implements ResolutionCtx {
  private readonly _memoizedResolves = new WeakMap<
    // WeakMap because if the item does not exist anymore,
    // apart from this map, there is no way to access the cached value anyway.
    object,
    { slotToValueMap: SlotToValueMap; result: string }[]
  >();
  private readonly _memoizedDerived = new WeakMap<
    // WeakMap because if the "derived" does not exist anymore,
    // apart from this map, there is no way to access the cached value anyway.
    TgpuDerived<unknown>,
    { slotToValueMap: SlotToValueMap; result: unknown }[]
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
  public readonly fixedBindings: FixedBindingConfig[] = [];
  // --

  public readonly callStack: unknown[] = [];
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

  getById(id: string): Resource | null {
    // TODO: Provide access to external values
    // TODO: Provide data type information
    // TODO: Return null if no id is found (when we can properly handle it)
    return (
      this._itemStateStack.getResourceById(id) ?? {
        value: id,
        dataType: UnknownData,
      }
    );
  }

  defineVariable(id: string, dataType: AnyWgslData | UnknownData): Resource {
    // TODO: Bring this behavior back when we have type inference
    // const resource = this.getById(id);

    // if (resource) {
    //   throw new Error(`Resource ${id} already exists in the current scope.`);
    // } else {
    //   return this._itemStateStack.defineBlockVariable(id, dataType);
    // }
    return this._itemStateStack.defineBlockVariable(id, dataType);
  }

  pushBlockScope() {
    this._itemStateStack.pushBlockScope();
  }

  popBlockScope() {
    this._itemStateStack.popBlockScope();
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
      .map(
        (arg) => `${arg.value}: ${this.resolve(arg.dataType as AnyWgslData)}`,
      )
      .join(', ');

    return {
      head:
        options.returnType !== undefined
          ? `(${argList}) -> ${getAttributesString(options.returnType)} ${this.resolve(options.returnType)}`
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

  allocateFixedEntry(
    layoutEntry: TgpuLayoutEntry,
    resource: object,
  ): { group: string; binding: number } {
    const binding = this.fixedBindings.length;
    this.fixedBindings.push({ layoutEntry, resource });

    return {
      group: CATCHALL_BIND_GROUP_IDX_MARKER,
      binding,
    };
  }

  readSlot<T>(slot: TgpuSlot<T>): T {
    const value = this._itemStateStack.readSlot(slot);

    if (value === undefined) {
      throw new MissingSlotValueError(slot);
    }

    return value;
  }

  withSlots<T>(pairs: SlotValuePair<unknown>[], callback: () => T): T {
    this._itemStateStack.pushSlotBindings(pairs);

    try {
      return callback();
    } finally {
      this._itemStateStack.pop();
    }
  }

  unwrap<T>(eventual: Eventual<T>): T {
    if (isProviding(eventual)) {
      return this.withSlots(
        eventual['~providing'].pairs,
        () => this.unwrap(eventual['~providing'].inner) as T,
      );
    }

    let maybeEventual = eventual;

    // Unwrapping all layers of slots.
    while (true) {
      if (isSlot(maybeEventual)) {
        maybeEventual = this.readSlot(maybeEventual);
      } else if (isDerived(maybeEventual)) {
        maybeEventual = this._getOrCompute(maybeEventual);
      } else {
        break;
      }
    }

    return maybeEventual;
  }

  _getOrCompute<T>(derived: TgpuDerived<T>): T {
    // All memoized versions of `derived`
    const instances = this._memoizedDerived.get(derived) ?? [];

    this._itemStateStack.pushItem();

    try {
      for (const instance of instances) {
        const slotValuePairs = [...instance.slotToValueMap.entries()];

        if (
          slotValuePairs.every(([slot, expectedValue]) =>
            slot.areEqual(this._itemStateStack.readSlot(slot), expectedValue),
          )
        ) {
          return instance.result as T;
        }
      }

      // If we got here, no item with the given slot-to-value combo exists in cache yet
      const result = derived['~compute']();

      // We know which slots the item used while resolving
      const slotToValueMap = new Map<TgpuSlot<unknown>, unknown>();
      for (const usedSlot of this._itemStateStack.topItem.usedSlots) {
        slotToValueMap.set(usedSlot, this._itemStateStack.readSlot(usedSlot));
      }

      instances.push({ slotToValueMap, result });
      this._memoizedDerived.set(derived, instances);

      return result;
    } catch (err) {
      if (err instanceof ResolutionError) {
        throw err.appendToTrace(derived);
      }

      throw new ResolutionError(err, [derived]);
    } finally {
      this._itemStateStack.pop();
    }
  }

  /**
   * @param item The item whose resolution should be either retrieved from the cache (if there is a cache hit), or resolved.
   */
  _getOrInstantiate(item: object): string {
    // All memoized versions of `item`
    const instances = this._memoizedResolves.get(item) ?? [];

    this._itemStateStack.pushItem();

    try {
      for (const instance of instances) {
        const slotValuePairs = [...instance.slotToValueMap.entries()];

        if (
          slotValuePairs.every(([slot, expectedValue]) =>
            slot.areEqual(this._itemStateStack.readSlot(slot), expectedValue),
          )
        ) {
          return instance.result;
        }
      }

      // If we got here, no item with the given slot-to-value combo exists in cache yet
      let result: string;
      if (isData(item)) {
        result = resolveData(this, item);
      } else if (isDerived(item) || isSlot(item)) {
        result = this.resolve(this.unwrap(item));
      } else if (isSelfResolvable(item)) {
        result = item['~resolve'](this);
      } else {
        result = this.resolveValue(item);
      }

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

  resolve(item: unknown): string {
    if (isProviding(item)) {
      return this.withSlots(item['~providing'].pairs, () =>
        this.resolve(item['~providing'].inner),
      );
    }

    if ((item && typeof item === 'object') || typeof item === 'function') {
      if (this._itemStateStack.itemDepth === 0) {
        try {
          pushMode(RuntimeMode.GPU);
          const result = provideCtx(this, () => this._getOrInstantiate(item));
          return `${[...this._declarations].join('\n\n')}${result}`;
        } finally {
          popMode(RuntimeMode.GPU);
        }
      }

      return this._getOrInstantiate(item);
    }

    return String(item);
  }

  resolveValue<T extends BaseData>(
    value: Infer<T>,
    schema?: T | undefined,
  ): string {
    if (isWgsl(value)) {
      return this.resolve(value);
    }

    if (schema && isWgslArray(schema)) {
      return `array(${(value as unknown[]).map((element) => this.resolveValue(element, schema.elementType))})`;
    }

    if (Array.isArray(value)) {
      return `array(${value.map((element) => this.resolveValue(element))})`;
    }

    if (schema && isWgslStruct(schema)) {
      return `${this.resolve(schema)}(${Object.entries(schema.propTypes).map(([key, type_]) => this.resolveValue((value as Infer<typeof schema>)[key], type_))})`;
    }

    throw new Error(
      `Value ${value} (as json: ${JSON.stringify(value)}) of schema ${schema} is not resolvable to WGSL`,
    );
  }
}

export interface ResolutionResult {
  code: string;
  bindGroupLayouts: TgpuBindGroupLayout[];
  catchall: [number, TgpuBindGroup] | null;
}

export function resolve(
  item: Wgsl,
  options: ResolutionCtxImplOptions,
): ResolutionResult {
  const ctx = new ResolutionCtxImpl(options);
  let code = ctx.resolve(item);

  const memoMap = ctx.bindGroupLayoutsToPlaceholderMap;
  const bindGroupLayouts: TgpuBindGroupLayout[] = [];
  const takenIndices = new Set<number>(
    [...memoMap.keys()]
      .map((layout) => layout.index)
      .filter((v): v is number => v !== undefined),
  );

  const automaticIds = naturalsExcept(takenIndices);

  const layoutEntries = ctx.fixedBindings.map(
    (binding, idx) =>
      [String(idx), binding.layoutEntry] as [string, TgpuLayoutEntry],
  );

  const createCatchallGroup = () => {
    const catchallIdx = automaticIds.next().value;
    const catchallLayout = bindGroupLayout(Object.fromEntries(layoutEntries));
    bindGroupLayouts[catchallIdx] = catchallLayout;
    code = code.replaceAll(CATCHALL_BIND_GROUP_IDX_MARKER, String(catchallIdx));

    return [
      catchallIdx,
      new TgpuBindGroupImpl(
        catchallLayout,
        Object.fromEntries(
          ctx.fixedBindings.map(
            (binding, idx) =>
              // biome-ignore lint/suspicious/noExplicitAny: <it's fine>
              [String(idx), binding.resource] as [string, any],
          ),
        ),
      ),
    ] as [number, TgpuBindGroup];
  };

  // Retrieving the catch-all binding index first, because it's inherently
  // the least swapped bind group (fixed and cannot be swapped).
  const catchall = layoutEntries.length > 0 ? createCatchallGroup() : null;

  for (const [layout, placeholder] of memoMap.entries()) {
    const idx = layout.index ?? automaticIds.next().value;
    bindGroupLayouts[idx] = layout;
    code = code.replaceAll(placeholder, String(idx));
  }

  return {
    code,
    bindGroupLayouts,
    catchall,
  };
}
