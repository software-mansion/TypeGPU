import { resolveData } from './core/resolve/resolveData.ts';
import { ConfigurableImpl } from './core/root/configurableImpl.ts';
import type { Configurable } from './core/root/rootTypes.ts';
import {
  type Eventual,
  isDerived,
  isProviding,
  isSlot,
  type SlotValuePair,
  type TgpuDerived,
  type TgpuSlot,
} from './core/slot/slotTypes.ts';
import { getAttributesString } from './data/attributes.ts';
import { type AnyData, isData } from './data/dataTypes.ts';
import type { Snippet } from './data/snippet.ts';
import { isWgslArray, isWgslStruct } from './data/wgslTypes.ts';
import {
  invariant,
  MissingSlotValueError,
  ResolutionError,
  WgslTypeError,
} from './errors.ts';
import { provideCtx, topLevelState } from './execMode.ts';
import type { NameRegistry } from './nameRegistry.ts';
import { naturalsExcept } from './shared/generators.ts';
import type { Infer } from './shared/repr.ts';
import { $internal, $providing } from './shared/symbols.ts';
import {
  bindGroupLayout,
  type TgpuBindGroup,
  TgpuBindGroupImpl,
  type TgpuBindGroupLayout,
  type TgpuLayoutEntry,
} from './tgpuBindGroupLayout.ts';
import { coerceToSnippet } from './tgsl/generationHelpers.ts';
import { generateFunction } from './tgsl/wgslGenerator.ts';
import type {
  ExecMode,
  ExecState,
  FnToWgslOptions,
  ItemLayer,
  ItemStateStack,
  ResolutionCtx,
  Wgsl,
} from './types.ts';
import {
  CodegenState,
  isMarkedInternal,
  isSelfResolvable,
  NormalState,
} from './types.ts';

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
};

type SlotToValueMap = Map<TgpuSlot<unknown>, unknown>;

type SlotBindingLayer = {
  type: 'slotBinding';
  bindingMap: WeakMap<TgpuSlot<unknown>, unknown>;
};

type FunctionScopeLayer = {
  type: 'functionScope';
  args: Snippet[];
  argAliases: Record<string, Snippet>;
  externalMap: Record<string, unknown>;
  returnType: AnyData;
};

type BlockScopeLayer = {
  type: 'blockScope';
  declarations: Map<string, Snippet>;
};

class ItemStateStackImpl implements ItemStateStack {
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

  get topFunctionReturnType(): AnyData {
    const scope = this._stack.findLast((e) => e.type === 'functionScope');
    if (!scope) {
      throw new Error('Internal error, expected function scope to be present.');
    }
    return scope.returnType;
  }

  pushItem() {
    this._itemDepth++;
    this._stack.push({
      type: 'item',
      usedSlots: new Set(),
    });
  }

  popItem() {
    this.pop('item');
  }

  pushSlotBindings(pairs: SlotValuePair<unknown>[]) {
    this._stack.push({
      type: 'slotBinding',
      bindingMap: new WeakMap(pairs),
    });
  }

  popSlotBindings() {
    this.pop('slotBinding');
  }

  pushFunctionScope(
    args: Snippet[],
    argAliases: Record<string, Snippet>,
    returnType: AnyData,
    externalMap: Record<string, unknown>,
  ) {
    this._stack.push({
      type: 'functionScope',
      args,
      argAliases,
      returnType,
      externalMap,
    });
  }

  popFunctionScope() {
    this.pop('functionScope');
  }

  pushBlockScope() {
    this._stack.push({
      type: 'blockScope',
      declarations: new Map(),
    });
  }

  popBlockScope() {
    this.pop('blockScope');
  }

  pop(type?: (typeof this._stack)[number]['type']) {
    const layer = this._stack[this._stack.length - 1];
    if (!layer || (type && layer.type !== type)) {
      throw new Error(`Internal error, expected a ${type} layer to be on top.`);
    }

    this._stack.pop();
    if (type === 'item') {
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

  getSnippetById(id: string): Snippet | undefined {
    for (let i = this._stack.length - 1; i >= 0; --i) {
      const layer = this._stack[i];

      if (layer?.type === 'functionScope') {
        const arg = layer.args.find((a) => a.value === id);
        if (arg !== undefined) {
          return arg;
        }

        if (layer.argAliases[id]) {
          return layer.argAliases[id];
        }

        const external = layer.externalMap[id];

        if (external !== undefined && external !== null) {
          return coerceToSnippet(external);
        }

        // Since functions cannot access resources from the calling scope, we
        // return early here.
        return undefined;
      }

      if (layer?.type === 'blockScope') {
        const snippet = layer.declarations.get(id);
        if (snippet !== undefined) {
          return snippet;
        }
      } else {
        // Skip
      }
    }

    return undefined;
  }

  defineBlockVariable(id: string, snippet: Snippet): void {
    if (snippet.dataType.type === 'unknown') {
      throw Error(`Tried to define variable '${id}' of unknown type`);
    }

    for (let i = this._stack.length - 1; i >= 0; --i) {
      const layer = this._stack[i];

      if (layer?.type === 'blockScope') {
        layer.declarations.set(id, snippet);
        return;
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

  withResetLevel<T>(callback: () => T): T {
    const savedLevel = this.identLevel;
    this.identLevel = 0;
    try {
      return callback();
    } finally {
      this.identLevel = savedLevel;
    }
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
  private readonly _itemStateStack = new ItemStateStackImpl();
  readonly #modeStack: ExecState[] = [];
  private readonly _declarations: string[] = [];
  private _varyingLocations: Record<string, number> | undefined;

  get varyingLocations() {
    return this._varyingLocations;
  }

  readonly [$internal] = {
    itemStateStack: this._itemStateStack,
  };

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

  public readonly names: NameRegistry;
  public expectedType: AnyData | undefined;

  constructor(opts: ResolutionCtxImplOptions) {
    this.names = opts.names;
  }

  get pre(): string {
    return this._indentController.pre;
  }

  get topFunctionReturnType() {
    return this._itemStateStack.topFunctionReturnType;
  }

  indent(): string {
    return this._indentController.indent();
  }

  dedent(): string {
    return this._indentController.dedent();
  }

  withResetIndentLevel<T>(callback: () => T): T {
    return this._indentController.withResetLevel(callback);
  }

  getById(id: string): Snippet | null {
    const item = this._itemStateStack.getSnippetById(id);

    if (item === undefined) {
      return null;
    }

    return item;
  }

  defineVariable(id: string, snippet: Snippet) {
    this._itemStateStack.defineBlockVariable(id, snippet);
  }

  pushBlockScope() {
    this._itemStateStack.pushBlockScope();
  }

  popBlockScope() {
    this._itemStateStack.popBlockScope();
  }

  fnToWgsl(options: FnToWgslOptions): { head: Wgsl; body: Wgsl } {
    this._itemStateStack.pushFunctionScope(
      options.args,
      options.argAliases,
      options.returnType,
      options.externalMap,
    );

    try {
      return {
        head: resolveFunctionHeader(this, options.args, options.returnType),
        body: generateFunction(this, options.body),
      };
    } finally {
      this._itemStateStack.popFunctionScope();
    }
  }

  addDeclaration(declaration: string): void {
    this._declarations.push(declaration);
  }

  allocateLayoutEntry(layout: TgpuBindGroupLayout): string {
    const memoMap = this.bindGroupLayoutsToPlaceholderMap;
    let placeholderKey = memoMap.get(layout);

    if (!placeholderKey) {
      placeholderKey = `#BIND_GROUP_LAYOUT_${this
        ._nextFreeLayoutPlaceholderIdx++}#`;
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
      this._itemStateStack.popSlotBindings();
    }
  }

  withVaryingLocations<T>(
    locations: Record<string, number>,
    callback: () => T,
  ): T {
    this._varyingLocations = locations;

    try {
      return callback();
    } finally {
      this._varyingLocations = undefined;
    }
  }

  unwrap<T>(eventual: Eventual<T>): T {
    if (isProviding(eventual)) {
      return this.withSlots(
        eventual[$providing].pairs,
        () => this.unwrap(eventual[$providing].inner) as T,
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
            slot.areEqual(this._itemStateStack.readSlot(slot), expectedValue)
          )
        ) {
          return instance.result as T;
        }
      }

      // If we got here, no item with the given slot-to-value combo exists in cache yet
      // Getting out of codegen or simulation mode so we can execute JS normally.
      this.pushMode(new NormalState());

      let result: T;
      try {
        result = derived['~compute']();
      } finally {
        this.popMode('normal');
      }

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
      this._itemStateStack.popItem();
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
            slot.areEqual(this._itemStateStack.readSlot(slot), expectedValue)
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
        throw new TypeError(
          `Unresolvable internal value: ${item} (as json: ${
            JSON.stringify(item)
          })`,
        );
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
      this._itemStateStack.popItem();
    }
  }

  resolve(item: unknown, schema?: AnyData | undefined): string {
    if (isProviding(item)) {
      return this.withSlots(
        item[$providing].pairs,
        () => this.resolve(item[$providing].inner, schema),
      );
    }

    if (isMarkedInternal(item)) {
      // Top-level resolve
      if (this._itemStateStack.itemDepth === 0) {
        try {
          this.pushMode(new CodegenState());
          const result = provideCtx(this, () => this._getOrInstantiate(item));

          return `${[...this._declarations].join('\n\n')}${result}`;
        } finally {
          this.popMode('codegen');
        }
      }

      return this._getOrInstantiate(item);
    }

    // This is a value that comes from the outside, maybe we can coerce it
    if (typeof item === 'number') {
      if (
        schema?.type === 'abstractInt' ||
        schema?.type === 'u32' ||
        schema?.type === 'i32'
      ) {
        return String(item);
      }

      // Just picking the shorter one
      const exp = item.toExponential();
      const decimal = String(item);
      return exp.length < decimal.length ? exp : decimal;
    }

    if (typeof item !== 'object' && typeof item !== 'function') {
      return String(item);
    }

    if (schema && isWgslArray(schema)) {
      if (!Array.isArray(item)) {
        throw new WgslTypeError(
          `Cannot coerce ${item} into value of type '${schema}'`,
        );
      }

      if (schema.elementCount !== item.length) {
        throw new WgslTypeError(
          `Cannot create value of type '${schema}' from an array of length: ${item.length}`,
        );
      }

      const elementTypeString = this.resolve(schema.elementType);
      return `array<${elementTypeString}, ${schema.elementCount}>(${
        item.map((element) =>
          this.resolve(element, schema.elementType as AnyData)
        )
      })`;
    }

    if (Array.isArray(item)) {
      return `array(${item.map((element) => this.resolve(element))})`;
    }

    if (schema && isWgslStruct(schema)) {
      return `${this.resolve(schema)}(${
        Object.entries(schema.propTypes).map(([key, type_]) =>
          this.resolve((item as Infer<typeof schema>)[key], type_ as AnyData)
        )
      })`;
    }

    throw new WgslTypeError(
      `Value ${item} (as json: ${JSON.stringify(item)}) is not resolvable${
        schema ? ` to type ${schema}` : ''
      }`,
    );
  }

  pushMode(mode: ExecState) {
    this.#modeStack.push(mode);
  }

  popMode(expected?: ExecMode) {
    const mode = this.#modeStack.pop();
    if (expected !== undefined) {
      invariant(mode?.type === expected, 'Unexpected mode');
    }
  }

  get mode(): ExecState {
    return this.#modeStack[this.#modeStack.length - 1] ?? topLevelState;
  }
}

/**
 * The results of a WGSL resolution.
 *
 * @param code - The resolved code.
 * @param usedBindGroupLayouts - List of used `tgpu.bindGroupLayout`s.
 * @param catchall - Automatically constructed bind group for buffer usages and buffer shorthands, preceded by its index.
 */
export interface ResolutionResult {
  code: string;
  usedBindGroupLayouts: TgpuBindGroupLayout[];
  catchall: [number, TgpuBindGroup] | undefined;
}

export function resolve(
  item: Wgsl,
  options: ResolutionCtxImplOptions,
  config?: (cfg: Configurable) => Configurable,
): ResolutionResult {
  const ctx = new ResolutionCtxImpl(options);
  let code = config
    ? ctx.withSlots(
      config(new ConfigurableImpl([])).bindings,
      () => ctx.resolve(item),
    )
    : ctx.resolve(item);

  const memoMap = ctx.bindGroupLayoutsToPlaceholderMap;
  const usedBindGroupLayouts: TgpuBindGroupLayout[] = [];
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
    usedBindGroupLayouts[catchallIdx] = catchallLayout;
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
  const catchall = layoutEntries.length > 0 ? createCatchallGroup() : undefined;

  for (const [layout, placeholder] of memoMap.entries()) {
    const idx = layout.index ?? automaticIds.next().value;
    usedBindGroupLayouts[idx] = layout;
    code = code.replaceAll(placeholder, String(idx));
  }

  return {
    code,
    usedBindGroupLayouts,
    catchall,
  };
}

export function resolveFunctionHeader(
  ctx: ResolutionCtx,
  args: Snippet[],
  returnType: AnyData,
) {
  const argList = args
    .map((arg) => `${arg.value}: ${ctx.resolve(arg.dataType as AnyData)}`)
    .join(', ');

  return returnType.type !== 'void'
    ? `(${argList}) -> ${getAttributesString(returnType)}${
      ctx.resolve(returnType)
    } `
    : `(${argList}) `;
}
