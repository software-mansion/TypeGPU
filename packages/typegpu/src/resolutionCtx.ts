import { MissingSlotValueError, ResolutionError } from './errors';
import { onGPU } from './gpuMode';
import type { JitTranspiler } from './jitTranspiler';
import type { NameRegistry } from './nameRegistry';
import {
  type GenerationCtx,
  type Resource,
  UnknownData,
  generateFunction,
} from './smol';
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
  private readonly _memoizedResolves = new WeakMap<
    // WeakMap because if the resolvable does not exist anymore,
    // apart from this map, there is no way to access the cached value anyway.
    TgpuResolvable,
    { slotToValueMap: SlotToValueMap; result: string }[]
  >();

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

  /**
   * @param item The item whose resolution should be either retrieved from the cache (if there is a cache hit), or resolved
   * with the `compute` method.
   * @param compute Returns the resolved item and the corresponding bindingMap. This result will be discarded if a sufficient cache entry is found.
   */
  getOrInstantiate(item: TgpuResolvable, itemCtx: ScopedResolutionCtx): string {
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
    const slotToValueMap = new Map<TgpuSlot<unknown>, unknown>();
    for (const usedSlot of itemCtx.usedSlots) {
      slotToValueMap.set(usedSlot, itemCtx.readSlot(usedSlot));
    }

    instances.push({ slotToValueMap, result });
    this._memoizedResolves.set(item, instances);

    return result;
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

export class ResolutionCtxImpl implements ResolutionCtx {
  private readonly _shared: SharedResolutionState;

  usedSlots = new Set<TgpuSlot<unknown>>();

  constructor({
    names,
    bindingGroup,
    jitTranspiler,
  }: ResolutionCtxImplOptions) {
    this._shared = new SharedResolutionState(
      names,
      bindingGroup ?? 0,
      jitTranspiler,
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

  addDeclaration(_declaration: TgpuResolvable) {
    throw new Error('Call ctx.resolve(item) instead of item.resolve(ctx)');
  }

  addBinding(_bindable: TgpuBindable, _identifier: TgpuIdentifier): void {
    throw new Error('Call ctx.resolve(item) instead of item.resolve(ctx)');
  }

  addRenderResource(
    resource: TgpuRenderResource,
    identifier: TgpuIdentifier,
  ): void {
    throw new Error('Call ctx.resolve(item) instead of item.resolve(ctx)');
  }

  addBuiltin(builtin: symbol): void {
    throw new Error('Call ctx.resolve(item) instead of item.resolve(ctx)');
  }

  nameFor(item: TgpuResolvable): string {
    return this._shared.names.nameFor(item);
  }

  readSlot<T>(slot: TgpuSlot<T>): T {
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

    const itemCtx = new ScopedResolutionCtx(this, this._shared, {
      slotBindings: slotValueOverrides,
    });

    const result = onGPU(() => this._shared.getOrInstantiate(item, itemCtx));

    return `${[...this._shared.declarations].join('\n\n')}${result}`;
  }

  // biome-ignore lint/suspicious/noExplicitAny: <no generic magic needed>
  transpileFn(fn: TgpuFn<any, any>): { head: Wgsl; body: Wgsl } {
    throw new Error('Call ctx.resolve(item) instead of item.resolve(ctx)');
  }

  getIndexFor(item: TgpuBindable | TgpuRenderResource) {
    const index = this._shared.getBindingIndex(item);
    if (index === undefined) {
      throw new Error('No index found for item');
    }
    return index;
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

class IndentController {
  private identLevel = 0;

  get pre(): string {
    if (INDENT[this.identLevel] !== undefined) {
      return INDENT[this.identLevel] as string;
    }

    let str = '';
    let i = this.identLevel;
    while (i > 8) {
      str += INDENT[8];
      i >>= 3;
    }

    return str;
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

type FnCtx = {
  argTypes: AnyTgpuData[];
  returnType: AnyTgpuData | undefined;
};

type ScopeOptions = {
  fnCtx?: FnCtx | undefined;
  slotBindings?: SlotValuePair<unknown>[] | undefined;
};

class ScopedResolutionCtx implements ResolutionCtx, GenerationCtx {
  usedSlots = new Set<TgpuSlot<unknown>>();

  private readonly _identController = new IndentController();

  constructor(
    private readonly _parent: ResolutionCtxImpl | ScopedResolutionCtx,
    private readonly _shared: SharedResolutionState,
    private readonly _scopeOptions: ScopeOptions,
  ) {}

  get pre(): string {
    return this._identController.pre;
  }

  indent(): string {
    return this._identController.indent();
  }

  dedent(): string {
    return this._identController.dedent();
  }

  getById(id: string): Resource {
    // TODO: Provide access to external values
    // TODO: Provide data type information
    return { value: id, dataType: UnknownData };
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

    const { argNames, body } = this._shared.jitTranspiler.transpileFn(
      String(fn.body),
    );

    const str = generateFunction(this, body);
    console.log(str);

    // TODO: Actually generate WGSL from SMoL
    return {
      head: code`(a: f32, b: f32) -> f32`,
      body: code`return a + b;`,
    };
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

  nameFor(token: TgpuResolvable): string {
    return this._shared.names.nameFor(token);
  }

  readSlot<T>(slot: TgpuSlot<T>): T {
    const slotToValuePair = this._scopeOptions.slotBindings?.find(
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

    const itemCtx = new ScopedResolutionCtx(this, this._shared, {
      slotBindings: slotValueOverrides,
    });

    return this._shared.getOrInstantiate(item, itemCtx);
  }

  // createScope(opts: { fnContext?: FnCtx; slots?: SlotValuePair<unknown>[] }) {
  //   // ...
  //   const itemCtx = new ScopedResolutionCtx(
  //     this,
  //     this._shared,
  //     slotValueOverrides,
  //   );
  // }
}
