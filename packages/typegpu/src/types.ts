import type { Block } from 'tinyest';
import type {
  TgpuBufferMutable,
  TgpuBufferReadonly,
  TgpuBufferUniform,
  TgpuBufferUsage,
} from './core/buffer/bufferUsage.js';
import type { TgpuConst } from './core/constant/tgpuConstant.js';
import type { TgpuDeclare } from './core/declare/tgpuDeclare.js';
import type { TgpuComputeFn } from './core/function/tgpuComputeFn.js';
import type { TgpuFn } from './core/function/tgpuFn.js';
import type { TgpuFragmentFn } from './core/function/tgpuFragmentFn.js';
import type { TgpuVertexFn } from './core/function/tgpuVertexFn.js';
import type { TgpuComputePipeline } from './core/pipeline/computePipeline.js';
import type { TgpuRenderPipeline } from './core/pipeline/renderPipeline.js';
import type { TgpuSampler } from './core/sampler/sampler.js';
import {
  type Eventual,
  type SlotValuePair,
  type TgpuAccessor,
  type TgpuSlot,
  isDerived,
  isProviding,
  isSlot,
} from './core/slot/slotTypes.js';
import type { TgpuExternalTexture } from './core/texture/externalTexture.js';
import type {
  TgpuAnyTextureView,
  TgpuTexture,
} from './core/texture/texture.js';
import type { TgpuVar } from './core/variable/tgpuVariable.js';
import type { AnyData } from './data/dataTypes.js';
import {
  type AnyMatInstance,
  type AnyVecInstance,
  type AnyWgslData,
  type BaseData,
  isWgslData,
} from './data/wgslTypes.js';
import type { NameRegistry } from './nameRegistry.js';
import { $internal, TypeCatalog } from './shared/internalMeta.js';
import type { Infer } from './shared/repr.js';
import type {
  TgpuBindGroupLayout,
  TgpuLayoutEntry,
} from './tgpuBindGroupLayout.js';

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
  [$internal]: {
    type: TypeCatalog.Unknown,
  },
} as const;

export type UnknownData = typeof UnknownData;
export const Void = {
  [$internal]: {
    type: TypeCatalog.Void,
  } as const,
};
export type Void = typeof Void;

export type Resource = {
  value: unknown;
  dataType: BaseData | UnknownData | Void;
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
    argNames: string[];
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
