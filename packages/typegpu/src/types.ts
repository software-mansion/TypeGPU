import type { Block } from 'tinyest';
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
import type {
  TgpuAnyTextureView,
  TgpuTexture,
} from './core/texture/texture.ts';
import type { TgpuVar } from './core/variable/tgpuVariable.ts';
import type { AnyData, Snippet, UnknownData } from './data/dataTypes.ts';
import {
  type AnyMatInstance,
  type AnyVecInstance,
  type AnyWgslData,
  type BaseData,
  isWgslData,
} from './data/wgslTypes.ts';
import type { NameRegistry } from './nameRegistry.ts';
import type { Infer, InferGPU } from './shared/repr.ts';
import { $internal } from './shared/symbols.ts';
import type {
  TgpuBindGroupLayout,
  TgpuLayoutEntry,
} from './tgpuBindGroupLayout.ts';

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
  | TgpuAnyTextureView
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
  returnType: AnyData;
  body: Block;
  externalMap: Record<string, unknown>;
}

export type ItemLayer = {
  type: 'item';
  usedSlots: Set<TgpuSlot<unknown>>;
};

export interface ItemStateStack {
  readonly itemDepth: number;
  readonly topItem: ItemLayer;

  pushItem(): void;
  popItem(): void;
  pushSlotBindings(pairs: SlotValuePair<unknown>[]): void;
  popSlotBindings(): void;
  pushFunctionScope(
    args: Snippet[],
    argAliases: Record<string, Snippet>,
    returnType: AnyData,
    externalMap: Record<string, unknown>,
  ): void;
  popFunctionScope(): void;
  pushBlockScope(): void;
  popBlockScope(): void;
  pop(type?: 'functionScope' | 'blockScope' | 'slotBinding' | 'item'): void;
  readSlot<T>(slot: TgpuSlot<T>): T | undefined;
  getSnippetById(id: string): Snippet | undefined;
  defineBlockVariable(id: string, type: AnyWgslData | UnknownData): Snippet;
}

/**
 * Passed into each resolvable item. All items in a tree share a resolution ctx,
 * but there can be layers added and removed from the item stack when going down
 * and up the tree.
 */
export interface ResolutionCtx {
  readonly names: NameRegistry;

  addDeclaration(declaration: string): void;

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

  /**
   * Unwraps all layers of slot/derived indirection and returns the concrete value if available.
   * @throws {MissingSlotValueError}
   */
  unwrap<T>(eventual: Eventual<T>): T;

  resolve(item: unknown): string;
  resolveValue<T extends BaseData>(
    value: Infer<T> | InferGPU<T>,
    schema: T,
  ): string;

  fnToWgsl(options: FnToWgslOptions): {
    head: Wgsl;
    body: Wgsl;
  };

  [$internal]: {
    itemStateStack: ItemStateStack;
  };
}

/**
 * Houses a method '~resolve` that returns a code string
 * representing it, as opposed to offloading the resolution
 * to another mechanism.
 */
export interface SelfResolvable {
  '~resolve'(ctx: ResolutionCtx): string;
  toString(): string;
}

export function isSelfResolvable(value: unknown): value is SelfResolvable {
  return typeof (value as SelfResolvable)?.['~resolve'] === 'function';
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
export type DefaultConversionStrategy = 'keep' | 'coerce';

export type FnArgsConversionHint =
  | AnyData[]
  | ((...args: Snippet[]) => AnyWgslData[])
  | DefaultConversionStrategy
  | undefined;

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

export function isMarkedInternal(
  value: unknown,
): value is { [$internal]: Record<string, unknown> } {
  return !!(value as { [$internal]: Record<string, unknown> })?.[$internal];
}
