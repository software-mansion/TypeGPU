import { isTgpuFn } from './core/function/tgpuFn.ts';
import {
  getUniqueName,
  type Namespace,
  type NamespaceInternal,
} from './core/resolve/namespace.ts';
import { resolveData } from './core/resolve/resolveData.ts';
import { stitch } from './core/resolve/stitch.ts';
import { ConfigurableImpl } from './core/root/configurableImpl.ts';
import type {
  Configurable,
  ExperimentalTgpuRoot,
} from './core/root/rootTypes.ts';
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
import { type AnyData, isData, UnknownData } from './data/dataTypes.ts';
import { bool } from './data/numeric.ts';
import { type ResolvedSnippet, snip, type Snippet } from './data/snippet.ts';
import { isWgslArray, isWgslStruct, Void } from './data/wgslTypes.ts';
import {
  invariant,
  MissingSlotValueError,
  ResolutionError,
  WgslTypeError,
} from './errors.ts';
import { provideCtx, topLevelState } from './execMode.ts';
import { naturalsExcept } from './shared/generators.ts';
import { isMarkedInternal } from './shared/symbols.ts';
import type { Infer } from './shared/repr.ts';
import { safeStringify } from './shared/stringify.ts';
import { $internal, $providing, $resolve } from './shared/symbols.ts';
import {
  bindGroupLayout,
  type TgpuBindGroup,
  TgpuBindGroupImpl,
  type TgpuBindGroupLayout,
  type TgpuLayoutEntry,
} from './tgpuBindGroupLayout.ts';
import {
  LogGeneratorImpl,
  LogGeneratorNullImpl,
} from './tgsl/consoleLog/logGenerator.ts';
import type { LogGenerator, LogResources } from './tgsl/consoleLog/types.ts';
import { getBestConversion } from './tgsl/conversion.ts';
import {
  coerceToSnippet,
  concretize,
  numericLiteralToSnippet,
} from './tgsl/generationHelpers.ts';
import type { ShaderGenerator } from './tgsl/shaderGenerator.ts';
import wgslGenerator from './tgsl/wgslGenerator.ts';
import type {
  ExecMode,
  ExecState,
  FnToWgslOptions,
  FunctionScopeLayer,
  ItemLayer,
  ItemStateStack,
  ResolutionCtx,
  TgpuShaderStage,
  Wgsl,
} from './types.ts';
import { CodegenState, isSelfResolvable, NormalState } from './types.ts';
import type { WgslExtension } from './wgslExtensions.ts';
import { hasTinyestMetadata } from './shared/meta.ts';

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
  readonly enableExtensions?: WgslExtension[] | undefined;
  readonly shaderGenerator?: ShaderGenerator | undefined;
  readonly config?: ((cfg: Configurable) => Configurable) | undefined;
  readonly root?: ExperimentalTgpuRoot | undefined;
  readonly namespace: Namespace;
};

type SlotBindingLayer = {
  type: 'slotBinding';
  bindingMap: WeakMap<TgpuSlot<unknown>, unknown>;
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

  get topFunctionScope(): FunctionScopeLayer | undefined {
    return this._stack.findLast((e) => e.type === 'functionScope');
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
    functionType: 'normal' | TgpuShaderStage,
    args: Snippet[],
    argAliases: Record<string, Snippet>,
    returnType: AnyData | undefined,
    externalMap: Record<string, unknown>,
  ): FunctionScopeLayer {
    const scope: FunctionScopeLayer = {
      type: 'functionScope',
      functionType,
      args,
      argAliases,
      returnType,
      externalMap,
      reportedReturnTypes: new Set(),
    };

    this._stack.push(scope);
    return scope;
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
  identLevel = 0;

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
  readonly #namespace: NamespaceInternal;
  readonly #shaderGenerator: ShaderGenerator;

  private readonly _indentController = new IndentController();
  private readonly _itemStateStack = new ItemStateStackImpl();
  readonly #modeStack: ExecState[] = [];
  private readonly _declarations: string[] = [];
  private _varyingLocations: Record<string, number> | undefined;
  readonly #currentlyResolvedItems: WeakSet<object> = new WeakSet();
  readonly #logGenerator: LogGenerator;

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

  public readonly enableExtensions: WgslExtension[] | undefined;
  public expectedType: AnyData | undefined;

  constructor(opts: ResolutionCtxImplOptions) {
    this.enableExtensions = opts.enableExtensions;
    this.#shaderGenerator = opts.shaderGenerator ?? wgslGenerator;
    this.#logGenerator = opts.root
      ? new LogGeneratorImpl(opts.root)
      : new LogGeneratorNullImpl();
    this.#namespace = opts.namespace[$internal];
  }

  getUniqueName(resource: object): string {
    return getUniqueName(this.#namespace, resource);
  }

  makeNameValid(name: string): string {
    return this.#namespace.nameRegistry.makeValid(name);
  }

  get pre(): string {
    return this._indentController.pre;
  }

  get topFunctionScope() {
    return this._itemStateStack.topFunctionScope;
  }

  get topFunctionReturnType() {
    const scope = this._itemStateStack.topFunctionScope;
    invariant(scope, 'Internal error, expected function scope to be present.');
    return scope.returnType;
  }

  get shelllessRepo() {
    return this.#namespace.shelllessRepo;
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

  reportReturnType(dataType: AnyData) {
    const scope = this._itemStateStack.topFunctionScope;
    invariant(scope, 'Internal error, expected function scope to be present.');
    scope.reportedReturnTypes.add(dataType);
  }

  pushBlockScope() {
    this._itemStateStack.pushBlockScope();
  }

  popBlockScope() {
    this._itemStateStack.popBlockScope();
  }

  generateLog(op: string, args: Snippet[]): Snippet {
    return this.#logGenerator.generateLog(this, op, args);
  }

  get logResources(): LogResources | undefined {
    return this.#logGenerator.logResources;
  }

  fnToWgsl(
    options: FnToWgslOptions,
  ): { head: Wgsl; body: Wgsl; returnType: AnyData } {
    const scope = this._itemStateStack.pushFunctionScope(
      options.functionType,
      options.args,
      options.argAliases,
      options.returnType,
      options.externalMap,
    );

    try {
      this.#shaderGenerator.initGenerator(this);
      const body = this.#shaderGenerator.functionDefinition(options.body);

      let returnType = options.returnType;
      if (!returnType) {
        const returnTypes = [...scope.reportedReturnTypes];
        if (returnTypes.length === 0) {
          returnType = Void;
        } else {
          const conversion = getBestConversion(returnTypes);
          if (conversion && !conversion.hasImplicitConversions) {
            returnType = conversion.targetType;
          }
        }

        if (!returnType) {
          throw new Error(
            `Expected function to have a single return type, got [${
              returnTypes.join(', ')
            }]. Cast explicitly to the desired type.`,
          );
        }

        returnType = concretize(returnType);
      }

      return {
        head: resolveFunctionHeader(this, options.args, returnType),
        body,
        returnType,
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
    const instances = this.#namespace.memoizedDerived.get(derived) ?? [];

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
      this.#namespace.memoizedDerived.set(derived, instances);
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
  _getOrInstantiate(item: object): ResolvedSnippet {
    // All memoized versions of `item`
    const instances = this.#namespace.memoizedResolves.get(item) ?? [];

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
      let result: ResolvedSnippet;
      if (isData(item)) {
        // Ref is arbitrary, as we're resolving a schema
        result = snip(resolveData(this, item), Void, /* origin */ 'runtime');
      } else if (isDerived(item) || isSlot(item)) {
        result = this.resolve(this.unwrap(item));
      } else if (isSelfResolvable(item)) {
        result = item[$resolve](this);
      } else if (hasTinyestMetadata(item)) {
        // Resolving a function with tinyest metadata directly means calling it with no arguments, since
        // we cannot infer the types of the arguments from a WGSL string.
        const shellless = this.#namespace.shelllessRepo.get(
          item,
          /* no arguments */ undefined,
        );
        if (!shellless) {
          throw new Error(
            `Couldn't resolve ${item.name}. Make sure it's a function that accepts no arguments, or call it from another TypeGPU function.`,
          );
        }

        return this.withResetIndentLevel(() => this.resolve(shellless));
      } else {
        throw new TypeError(
          `Unresolvable internal value: ${safeStringify(item)}`,
        );
      }

      // We know which slots the item used while resolving
      const slotToValueMap = new Map<TgpuSlot<unknown>, unknown>();
      for (const usedSlot of this._itemStateStack.topItem.usedSlots) {
        slotToValueMap.set(usedSlot, this._itemStateStack.readSlot(usedSlot));
      }

      instances.push({ slotToValueMap, result });
      this.#namespace.memoizedResolves.set(item, instances);

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

  resolve(
    item: unknown,
    schema?: AnyData | UnknownData | undefined,
  ): ResolvedSnippet {
    if (isTgpuFn(item) || hasTinyestMetadata(item)) {
      if (
        this.#currentlyResolvedItems.has(item) &&
        !this.#namespace.memoizedResolves.has(item)
      ) {
        throw new Error(
          `Recursive function ${item} detected. Recursion is not allowed on the GPU.`,
        );
      }
      this.#currentlyResolvedItems.add(item as object);
    }

    if (isProviding(item)) {
      return this.withSlots(
        item[$providing].pairs,
        () => this.resolve(item[$providing].inner, schema),
      );
    }

    if (isMarkedInternal(item) || hasTinyestMetadata(item)) {
      // Top-level resolve
      if (this._itemStateStack.itemDepth === 0) {
        try {
          this.pushMode(new CodegenState());
          const result = provideCtx(this, () => this._getOrInstantiate(item));
          return snip(
            `${[...this._declarations].join('\n\n')}${result.value}`,
            Void,
            /* origin */ 'runtime', // arbitrary
          );
        } finally {
          this.popMode('codegen');
        }
      }

      return this._getOrInstantiate(item);
    }

    // This is a value that comes from the outside, maybe we can coerce it
    if (typeof item === 'number') {
      const realSchema = schema ?? numericLiteralToSnippet(item).dataType;
      invariant(
        realSchema.type !== 'unknown',
        'Schema has to be known for resolving numbers',
      );

      if (realSchema.type === 'abstractInt') {
        return snip(`${item}`, realSchema, /* origin */ 'constant');
      }
      if (realSchema.type === 'u32') {
        return snip(`${item}u`, realSchema, /* origin */ 'constant');
      }
      if (realSchema.type === 'i32') {
        return snip(`${item}i`, realSchema, /* origin */ 'constant');
      }

      const exp = item.toExponential();
      const decimal =
        realSchema.type === 'abstractFloat' && Number.isInteger(item)
          ? `${item}.`
          : `${item}`;

      // Just picking the shorter one
      const base = exp.length < decimal.length ? exp : decimal;
      if (realSchema.type === 'f32') {
        return snip(`${base}f`, realSchema, /* origin */ 'constant');
      }
      if (realSchema.type === 'f16') {
        return snip(`${base}h`, realSchema, /* origin */ 'constant');
      }
      return snip(base, realSchema, /* origin */ 'constant');
    }

    if (typeof item === 'boolean') {
      return snip(item ? 'true' : 'false', bool, /* origin */ 'constant');
    }

    if (typeof item === 'string') {
      // Already resolved
      return snip(item, Void, /* origin */ 'runtime');
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
      return snip(
        stitch`array<${elementTypeString}, ${schema.elementCount}>(${
          item.map((element) =>
            snip(
              element,
              schema.elementType as AnyData,
              /* origin */ 'runtime',
            )
          )
        })`,
        schema,
        /* origin */ 'runtime',
      );
    }

    if (Array.isArray(item)) {
      return snip(
        stitch`array(${item.map((element) => this.resolve(element))})`,
        UnknownData,
        /* origin */ 'runtime',
      ) as ResolvedSnippet;
    }

    if (schema && isWgslStruct(schema)) {
      return snip(
        stitch`${this.resolve(schema)}(${
          Object.entries(schema.propTypes).map(([key, propType]) =>
            snip(
              (item as Infer<typeof schema>)[key],
              propType as AnyData,
              /* origin */ 'runtime',
            )
          )
        })`,
        schema,
        /* origin */ 'runtime', // a new struct, not referenced from anywhere
      );
    }

    throw new WgslTypeError(
      `Value ${item} (as json: ${safeStringify(item)}) is not resolvable${
        schema ? ` to type ${schema.type}` : ''
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
 * @param logResources - Buffers and information about used console.logs needed to decode the raw data.
 */
export interface ResolutionResult {
  code: string;
  usedBindGroupLayouts: TgpuBindGroupLayout[];
  catchall: [number, TgpuBindGroup] | undefined;
  logResources: LogResources | undefined;
}

export function resolve(
  item: Wgsl,
  options: ResolutionCtxImplOptions,
): ResolutionResult {
  const ctx = new ResolutionCtxImpl(options);
  const snippet = options.config
    ? ctx.withSlots(
      options.config(new ConfigurableImpl([])).bindings,
      () => ctx.resolve(item),
    )
    : ctx.resolve(item);
  let code = snippet.value;

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

  if (options.enableExtensions && options.enableExtensions.length > 0) {
    const extensions = options.enableExtensions.map((ext) => `enable ${ext};`);
    code = `${extensions.join('\n')}\n\n${code}`;
  }

  return {
    code,
    usedBindGroupLayouts,
    catchall,
    logResources: ctx.logResources,
  };
}

export function resolveFunctionHeader(
  ctx: ResolutionCtx,
  args: Snippet[],
  returnType: AnyData,
) {
  const argList = args
    .map((arg) => `${arg.value}: ${ctx.resolve(arg.dataType as AnyData).value}`)
    .join(', ');

  return returnType.type !== 'void'
    ? `(${argList}) -> ${getAttributesString(returnType)}${
      ctx.resolve(returnType).value
    } `
    : `(${argList}) `;
}
