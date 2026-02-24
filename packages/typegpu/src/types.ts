import type { Block, FuncParameter } from 'tinyest';
import type { TgpuBuffer } from './core/buffer/buffer.ts';
import type {
  TgpuBufferMutable,
  TgpuBufferReadonly,
  TgpuBufferUniform,
  TgpuBufferUsage,
} from './core/buffer/bufferUsage.ts';
import type { TgpuConst } from './core/constant/tgpuConstant.ts';
import type { TgpuDeclare } from './core/declare/tgpuDeclare.ts';
import type { TgpuComputeFn } from './core/function/tgpuComputeFn.ts';
import type { TgpuFn } from './core/function/tgpuFn.ts';
import type { TgpuFragmentFn } from './core/function/tgpuFragmentFn.ts';
import type { TgpuVertexFn } from './core/function/tgpuVertexFn.ts';
import type { TgpuComputePipeline } from './core/pipeline/computePipeline.ts';
import type { TgpuRenderPipeline } from './core/pipeline/renderPipeline.ts';
import type { TgpuSampler } from './core/sampler/sampler.ts';
import {
  type Eventual,
  isLazy,
  isProviding,
  isSlot,
  type SlotValuePair,
  type TgpuAccessor,
  type TgpuSlot,
} from './core/slot/slotTypes.ts';
import type { TgpuExternalTexture } from './core/texture/externalTexture.ts';
import type { TgpuTexture, TgpuTextureView } from './core/texture/texture.ts';
import type { TgpuVar } from './core/variable/tgpuVariable.ts';
import { type AnyData, UnknownData } from './data/dataTypes.ts';
import type {
  MapValueToSnippet,
  ResolvedSnippet,
  Snippet,
} from './data/snippet.ts';
import {
  type AnyMatInstance,
  type AnyVecInstance,
  type BaseData,
  isWgslData,
} from './data/wgslTypes.ts';
import {
  $cast,
  $gpuCallable,
  $gpuValueOf,
  $internal,
  $ownSnippet,
  $resolve,
} from './shared/symbols.ts';
import type {
  TgpuBindGroupLayout,
  TgpuLayoutEntry,
} from './tgpuBindGroupLayout.ts';
import type { WgslExtension } from './wgslExtensions.ts';
import type { Infer } from './shared/repr.ts';

export type ResolvableObject =
  | SelfResolvable
  | TgpuBufferUsage
  | TgpuConst
  | TgpuDeclare
  | TgpuBindGroupLayout
  | TgpuFn
  | TgpuComputeFn
  | TgpuFragmentFn
  | TgpuComputePipeline
  | TgpuRenderPipeline
  | TgpuVertexFn
  | TgpuSampler
  | TgpuAccessor
  | TgpuExternalTexture
  | TgpuTexture
  | TgpuTextureView
  | TgpuVar
  | AnyVecInstance
  | AnyMatInstance
  | AnyData
  | ((...args: never[]) => unknown);

export type Wgsl = Eventual<string | number | boolean | ResolvableObject>;

export type TgpuShaderStage = 'compute' | 'vertex' | 'fragment';

export interface FnToWgslOptions {
  functionType: 'normal' | TgpuShaderStage;
  argTypes: BaseData[];
  /**
   * The return type of the function. If undefined, the type should be inferred
   * from the implementation (relevant for shellless functions).
   */
  returnType: BaseData | undefined;
  body: Block;
  params: FuncParameter[];
  externalMap: Record<string, unknown>;
}

export type ItemLayer = {
  type: 'item';
  usedSlots: Set<TgpuSlot<unknown>>;
};

export type FunctionScopeLayer = {
  type: 'functionScope';
  functionType: 'normal' | 'compute' | 'vertex' | 'fragment';
  args: Snippet[];
  argAliases: Record<string, Snippet>;
  externalMap: Record<string, unknown>;
  /**
   * The return type of the function. If undefined, the type should be inferred
   * from the implementation (relevant for shellless functions).
   */
  returnType: BaseData | undefined;
  /**
   * All types used in `return` statements.
   */
  reportedReturnTypes: Set<BaseData>;
};

export type SlotBindingLayer = {
  type: 'slotBinding';
  bindingMap: WeakMap<TgpuSlot<unknown>, unknown>;
};

export type BlockScopeLayer = {
  type: 'blockScope';
  declarations: Map<string, Snippet>;
  externals: Map<string, Snippet>;
};

export type StackLayer =
  | ItemLayer
  | SlotBindingLayer
  | FunctionScopeLayer
  | BlockScopeLayer;

export interface ItemStateStack {
  readonly itemDepth: number;
  readonly topItem: ItemLayer;
  readonly topFunctionScope: FunctionScopeLayer | undefined;

  pushItem(): void;
  pushSlotBindings(pairs: SlotValuePair[]): void;
  pushFunctionScope(
    functionType: 'normal' | TgpuShaderStage,
    args: Snippet[],
    argAliases: Record<string, Snippet>,
    /**
     * The return type of the function. If undefined, the type should be inferred
     * from the implementation (relevant for shellless functions).
     */
    returnType: BaseData | undefined,
    externalMap: Record<string, unknown>,
  ): FunctionScopeLayer;
  pushBlockScope(): void;
  setBlockExternals(externals: Record<string, Snippet>): void;
  clearBlockExternals(): void;

  pop<T extends StackLayer['type']>(type: T): Extract<StackLayer, { type: T }>;
  pop(): StackLayer | undefined;

  readSlot<T>(slot: TgpuSlot<T>): T | undefined;
  getSnippetById(id: string): Snippet | undefined;
  defineBlockVariable(id: string, snippet: Snippet): void;
  setBlockExternals(externals: Record<string, Snippet>): void;
  clearBlockExternals(): void;
}

/**
 * # What are execution modes/states? 🤷
 * They're used to control how each TypeGPU resource reacts
 * to actions upon them.
 *
 * ## Normal mode
 * This is the default mode, where resources are acted upon
 * by code either:
 * - Not wrapped inside any of our execution-altering APIs
 * like tgpu.resolve or tgpu.simulate.
 * - Inside tgpu.lazy definitions, where we're taking a break
 *   from codegen/simulation to create resources on-demand.
 *
 * ```ts
 * const count = tgpu.privateVar(d.f32);
 * count.$ += 1; // Illegal in top-level
 *
 * const root = await tgpu.init();
 * const countMutable = root.createMutable(d.f32);
 * countMutable.$ = [1, 2, 3]; // Illegal in top-level
 * countMutable.write([1, 2, 3]); // OK!
 * ```
 *
 * ## Codegen mode
 * Brought upon by `tgpu.resolve()` (or higher-level APIs using it like our pipelines).
 * Resources are expected to generate WGSL code that represents them, instead of
 * fulfilling their task in JS.
 *
 * ```ts
 * const foo = tgpu.fn([], d.f32)(() => 123);
 * // The following is running in `codegen` mode
 * console.log(foo()); // Prints `foo_0()`
 * ```
 *
 * ## Simulate mode
 * Callbacks passed to `tgpu.simulate()` are executed in this mode. Each 'simulation'
 * is isolated, and does not share state with other simulations (even nested ones).
 * Variables and buffers can be accessed and mutated directly, and their state
 * is returned at the end of the simulation.
 *
 * ```ts
 * const var = tgpu.privateVar(d.f32, 0);
 *
 * const result = tgpu.simulate(() => {
 *   // This is running in `simulate` mode
 *   var.$ += 1; // Direct access is legal
 *   return var.$; // Returns 1
 * });
 *
 * console.log(result.value); // Prints 1
 * ```
 */
export type ExecMode = 'normal' | 'codegen' | 'simulate';

export class NormalState {
  readonly type = 'normal' as const;
}

export class CodegenState {
  readonly type = 'codegen' as const;
}

export class SimulationState {
  readonly type = 'simulate' as const;

  constructor(
    readonly buffers: Map<TgpuBuffer<BaseData>, unknown>,
    readonly vars: {
      private: Map<TgpuVar, unknown>;
      workgroup: Map<TgpuVar, unknown>;
    },
  ) {}
}

export type ExecState =
  | NormalState
  | CodegenState
  | SimulationState;

export type ShaderStage =
  | 'vertex'
  | 'fragment'
  | 'compute'
  | undefined;

/**
 * Passed into each resolvable item. All items in a tree share a resolution ctx,
 * but there can be layers added and removed from the item stack when going down
 * and up the tree.
 */
export interface ResolutionCtx {
  [$internal]: {
    itemStateStack: ItemStateStack;
  };

  readonly mode: ExecState;
  readonly enableExtensions: WgslExtension[] | undefined;

  addDeclaration(declaration: string): void;
  withResetIndentLevel<T>(callback: () => T): T;

  /**
   * Reserves a bind group number, and returns a placeholder that will be replaced
   * with a concrete number at the end of the resolution process.
   */
  allocateLayoutEntry(layout: TgpuBindGroupLayout): string;

  /**
   * Reserves a spot in the catch-all bind group, without the indirection of a bind-group.
   * This means the resource is 'fixed', and cannot be swapped between code execution.
   */
  allocateFixedEntry(
    layoutEntry: TgpuLayoutEntry,
    resource: object,
  ): {
    group: string;
    binding: number;
  };

  withSlots<T>(pairs: SlotValuePair[], callback: () => T): T;

  pushMode(state: ExecState): void;
  popMode(expected?: ExecMode): void;

  /**
   * Unwraps all layers of slot/lazy indirection and returns the concrete value if available.
   * @throws {MissingSlotValueError}
   */
  unwrap<T>(eventual: Eventual<T>): T;

  /**
   * Returns the snippet representing `item`.
   *
   * @param item The value to resolve
   * @param schema Additional information about the item's data type
   * @param exact Should the inferred value of the resulting code be typed exactly as `schema` (true),
   *              or is being assignable to `schema` enough (false). Default is false.
   */
  resolve(
    item: unknown,
    schema?: BaseData | UnknownData,
    exact?: boolean,
  ): ResolvedSnippet;

  fnToWgsl(options: FnToWgslOptions): {
    head: Wgsl;
    body: Wgsl;
    returnType: BaseData;
  };

  withVaryingLocations<T>(
    locations: Record<string, number>,
    callback: () => T,
  ): T;

  get varyingLocations(): Record<string, number> | undefined;

  /**
   * Temporarily renames the item.
   * Useful for resolutions with slots,
   * since functions with different slots should have different names,
   * and all hold the same inner function that is being resolved multiple times.
   * @param item the item to rename
   * @param name the temporary name to assign to the item (if missing, just returns `callback()`)
   */
  withRenamed<T>(item: object, name: string | undefined, callback: () => T): T;

  getUniqueName(resource: object): string;
  makeNameValid(name: string): string;
}

/**
 * Houses a method on the symbol '$resolve` that returns a
 * code string representing it, as opposed to offloading the
 * resolution to another mechanism.
 */
export interface SelfResolvable {
  [$internal]: unknown;
  [$resolve](ctx: ResolutionCtx): ResolvedSnippet;
  toString(): string;
}

export function isSelfResolvable(value: unknown): value is SelfResolvable {
  return !!(value as SelfResolvable)?.[$resolve];
}

export interface WithGPUValue<T> {
  readonly [$gpuValueOf]: T;
}

export interface WithOwnSnippet {
  readonly [$ownSnippet]: Snippet;
}

export function getOwnSnippet(value: unknown): Snippet | undefined {
  return (value as WithOwnSnippet)?.[$ownSnippet];
}

export interface GPUCallable<TArgs extends unknown[] = unknown[]> {
  [$gpuCallable]: {
    strictSignature?:
      | { argTypes: (BaseData | BaseData[])[]; returnType: BaseData }
      | undefined;
    call(ctx: ResolutionCtx, args: MapValueToSnippet<TArgs>): Snippet;
  };
}

export function isGPUCallable(value: unknown): value is GPUCallable {
  return !!(value as GPUCallable)?.[$gpuCallable];
}

export type WithCast<T = BaseData> = GPUCallable<[v?: Infer<T>]> & {
  readonly [$cast]: (v?: Infer<T>) => Infer<T>;
};

export function hasCast(value: unknown): value is WithCast {
  return !!(value as WithCast)?.[$cast];
}

type AnyFn = (...args: never[]) => unknown;
export type DualFn<T extends AnyFn> = T & GPUCallable<Parameters<T>>;

export function isKnownAtComptime(snippet: Snippet): boolean {
  return (typeof snippet.value !== 'string' ||
    snippet.dataType === UnknownData) &&
    getOwnSnippet(snippet.value) === undefined;
}

export function isWgsl(value: unknown): value is Wgsl {
  return (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    isSelfResolvable(value) ||
    isWgslData(value) ||
    isSlot(value) ||
    isLazy(value) ||
    isProviding(value)
  );
}

export type BindableBufferUsage = 'uniform' | 'readonly' | 'mutable';
export type BufferUsage = 'uniform' | 'readonly' | 'mutable' | 'vertex';

export function isGPUBuffer(value: unknown): value is GPUBuffer {
  return (
    !!value &&
    typeof value === 'object' &&
    'getMappedRange' in value &&
    'mapAsync' in value
  );
}

export function isBufferUsage(value: unknown): value is
  | TgpuBufferUniform<BaseData>
  | TgpuBufferReadonly<BaseData>
  | TgpuBufferMutable<BaseData> {
  return (value as
    | TgpuBufferUniform<BaseData>
    | TgpuBufferReadonly<BaseData>
    | TgpuBufferMutable<BaseData>)?.resourceType === 'buffer-usage';
}
