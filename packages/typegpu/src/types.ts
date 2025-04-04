import type { ArgNames, Block } from 'tinyest';
import type {
  TgpuBufferMutable,
  TgpuBufferReadonly,
  TgpuBufferUniform,
  TgpuBufferUsage,
} from './core/buffer/bufferUsage';
import type { TgpuConst } from './core/constant/tgpuConstant';
import type { TgpuDeclare } from './core/declare/tgpuDeclare';
import type { TgpuComputeFn } from './core/function/tgpuComputeFn';
import type { TgpuFn } from './core/function/tgpuFn';
import type { TgpuFragmentFn } from './core/function/tgpuFragmentFn';
import type { TgpuVertexFn } from './core/function/tgpuVertexFn';
import type { TgpuComputePipeline } from './core/pipeline/computePipeline';
import type { TgpuRenderPipeline } from './core/pipeline/renderPipeline';
import type { TgpuSampler } from './core/sampler/sampler';
import {
  type Eventual,
  type SlotValuePair,
  type TgpuAccessor,
  type TgpuSlot,
  isDerived,
  isProviding,
  isSlot,
} from './core/slot/slotTypes';
import type { TgpuExternalTexture } from './core/texture/externalTexture';
import type { TgpuAnyTextureView, TgpuTexture } from './core/texture/texture';
import type { TgpuVar } from './core/variable/tgpuVariable';
import type { AnyData } from './data';
import {
  type AnyMatInstance,
  type AnyVecInstance,
  type AnyWgslData,
  type BaseData,
  isWgslData,
} from './data/wgslTypes';
import type { NameRegistry } from './nameRegistry';
import type { Infer } from './shared/repr';
import { $internal } from './shared/symbols';
import type {
  TgpuBindGroupLayout,
  TgpuLayoutEntry,
} from './tgpuBindGroupLayout';

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
  // biome-ignore lint/suspicious/noExplicitAny: <has to be more permissive than unknown>
  | TgpuFn<any, any>;

export type Wgsl = Eventual<string | number | boolean | ResolvableObject>;

export const UnknownData = {
  type: 'unknown' as const,
};
export type UnknownData = typeof UnknownData;

export type Resource = {
  value: unknown;
  dataType: AnyData | UnknownData;
};

export type TgpuShaderStage = 'compute' | 'vertex' | 'fragment';

export interface FnToWgslOptions {
  args: Resource[];
  returnType: AnyWgslData;
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
    args: Resource[],
    returnType: AnyWgslData | undefined,
    externalMap: Record<string, unknown>,
  ): void;
  popFunctionScope(): void;
  pushBlockScope(): void;
  popBlockScope(): void;
  pop(type?: 'functionScope' | 'blockScope' | 'slotBinding' | 'item'): void;
  readSlot<T>(slot: TgpuSlot<T>): T | undefined;
  getResourceById(id: string): Resource | undefined;
  defineBlockVariable(id: string, type: AnyWgslData | UnknownData): Resource;
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
  resolveValue<T extends BaseData>(value: Infer<T>, schema: T): string;

  transpileFn(fn: string): {
    argNames: ArgNames;
    body: Block;
    externalNames: string[];
  };
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

export interface Labelled {
  readonly label?: string | undefined;
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

export function hasInternalDataType(
  value: unknown,
): value is { [$internal]: { dataType: BaseData } } {
  return (
    !!value &&
    typeof value === 'object' &&
    !!(value as { [$internal]: { dataType: BaseData } })?.[$internal]?.dataType
  );
}

export function isMarkedInternal(
  value: unknown,
): value is { [$internal]: Record<string, unknown> } {
  return !!(value as { [$internal]: Record<string, unknown> })?.[$internal];
}
