import type { Block } from 'tinyest';
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
  isDerived,
  isProviding,
  isSlot,
  type SlotValuePair,
  type TgpuAccessor,
  type TgpuSlot,
} from './core/slot/slotTypes.ts';
import type { TgpuExternalTexture } from './core/texture/externalTexture.ts';
import type { TgpuTexture, TgpuTextureView } from './core/texture/texture.ts';
import type { TgpuVar } from './core/variable/tgpuVariable.ts';
import type { AnyData, UnknownData } from './data/dataTypes.ts';
import type { ResolvedSnippet, Snippet } from './data/snippet.ts';
import {
  type AnyMatInstance,
  type AnyVecInstance,
  type AnyWgslData,
  type BaseData,
  isWgslData,
} from './data/wgslTypes.ts';
import {
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

export type ResolvableObject =
  | SelfResolvable
  | TgpuBufferUsage
  | TgpuConst
  | TgpuDeclare
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
  | TgpuFn;

export type Wgsl = Eventual<string | number | boolean | ResolvableObject>;

export type TgpuShaderStage = 'compute' | 'vertex' | 'fragment';

export interface FnToWgslOptions {
  args: Snippet[];
  argAliases: Record<string, Snippet>;
  /**
   * The return type of the function. If undefined, the type should be inferred
   * from the implementation (relevant for shellless functions).
   */
  returnType: AnyData | undefined;
  body: Block;
  externalMap: Record<string, unknown>;
}

export type ItemLayer = {
  type: 'item';
  usedSlots: Set<TgpuSlot<unknown>>;
};

export type FunctionScopeLayer = {
  type: 'functionScope';
  args: Snippet[];
  argAliases: Record<string, Snippet>;
  externalMap: Record<string, unknown>;
  /**
   * The return type of the function. If undefined, the type should be inferred
   * from the implementation (relevant for shellless functions).
   */
  returnType: AnyData | undefined;
  /**
   * All types used in `return` statements.
   */
  reportedReturnTypes: Set<AnyData>;
};

export interface ItemStateStack {
  readonly itemDepth: number;
  readonly topItem: ItemLayer;
  readonly topFunctionScope: FunctionScopeLayer | undefined;

  pushItem(): void;
  popItem(): void;
  pushSlotBindings(pairs: SlotValuePair<unknown>[]): void;
  popSlotBindings(): void;
  pushFunctionScope(
    args: Snippet[],
    argAliases: Record<string, Snippet>,
    /**
     * The return type of the function. If undefined, the type should be inferred
     * from the implementation (relevant for shellless functions).
     */
    returnType: AnyData | undefined,
    externalMap: Record<string, unknown>,
  ): FunctionScopeLayer;
  popFunctionScope(): void;
  pushBlockScope(): void;
  popBlockScope(): void;
  pop(type?: 'functionScope' | 'blockScope' | 'slotBinding' | 'item'): void;
  readSlot<T>(slot: TgpuSlot<T>): T | undefined;
  getSnippetById(id: string): Snippet | undefined;
  defineBlockVariable(id: string, snippet: Snippet): void;
}

/**
 * # What are execution modes/states? 🤷‍♂️
 * They're used to control how each TypeGPU resource reacts
 * to actions upon them.
 *
 * ## Normal mode
 * This is the default mode, where resources are acted upon
 * by code either:
 * - Not wrapped inside any of our execution-altering APIs
 * like tgpu.resolve or tgpu.simulate.
 * - Inside tgpu.derived definitions, where we're taking a break
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
    readonly buffers: Map<TgpuBuffer<AnyData>, unknown>,
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

  withSlots<T>(pairs: SlotValuePair<unknown>[], callback: () => T): T;

  pushMode(state: ExecState): void;
  popMode(expected?: ExecMode | undefined): void;

  /**
   * Unwraps all layers of slot/derived indirection and returns the concrete value if available.
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
    schema?: AnyData | UnknownData | undefined,
    exact?: boolean | undefined,
  ): ResolvedSnippet;

  fnToWgsl(options: FnToWgslOptions): {
    head: Wgsl;
    body: Wgsl;
    returnType: AnyData;
  };

  withVaryingLocations<T>(
    locations: Record<string, number>,
    callback: () => T,
  ): T;

  get varyingLocations(): Record<string, number> | undefined;

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

export function isWgsl(value: unknown): value is Wgsl {
  return (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    isSelfResolvable(value) ||
    isWgslData(value) ||
    isSlot(value) ||
    isDerived(value) ||
    isProviding(value)
  );
}

export type BindableBufferUsage = 'uniform' | 'readonly' | 'mutable';
export type BufferUsage = 'uniform' | 'readonly' | 'mutable' | 'vertex';
export type ConversionStrategy =
  | 'keep'
  | 'unify';

/**
 * Optional hints for converting function argument types during resolution.
 * In case of tgpu functions, this is just the array of argument schemas.
 * In case of raw dualImpls (e.g. in std), this is either a function that converts the snippets appropriately,
 * or a string defining a conversion strategy.
 * The strategy 'keep' is the default.
 */
export type FnArgsConversionHint =
  | AnyData[]
  | ((...args: Snippet[]) => AnyWgslData[])
  | ConversionStrategy;

export function isGPUBuffer(value: unknown): value is GPUBuffer {
  return (
    !!value &&
    typeof value === 'object' &&
    'getMappedRange' in value &&
    'mapAsync' in value
  );
}

export function isBufferUsage<
  T extends
    | TgpuBufferUniform<BaseData>
    | TgpuBufferReadonly<BaseData>
    | TgpuBufferMutable<BaseData>,
>(value: T | unknown): value is T {
  return (value as T)?.resourceType === 'buffer-usage';
}
