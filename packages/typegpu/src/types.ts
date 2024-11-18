import type { Block } from 'tinyest';
import type { ISchema } from 'typed-binary';
import type { TgpuNamable } from './namable';
import type { NameRegistry } from './nameRegistry';

export type Wgsl = string | number | TgpuResolvable | symbol | boolean;

export const UnknownData = Symbol('Unknown data type');
export type UnknownData = typeof UnknownData;

export type Resource = {
  value: unknown;
  dataType: AnyTgpuData | UnknownData;
};

export type TgpuShaderStage = 'compute' | 'vertex' | 'fragment';

export interface NumberArrayView {
  readonly length: number;
  [n: number]: number;
}

export interface FnToWgslOptions {
  args: Resource[];
  returnType: AnyTgpuData;
  body: Block;
  externalMap: Record<string, unknown>;
}

/**
 * Passed into each resolvable item. All items in a tree share a resolution ctx,
 * but there can be layers added and removed from the item stack when going down
 * and up the tree.
 */
export interface ResolutionCtx {
  readonly names: NameRegistry;

  addDeclaration(declaration: string): void;
  addBinding(bindable: TgpuBindable, identifier: string): void;
  addRenderResource(resource: TgpuRenderResource, identifier: string): void;
  /**
   * Unwraps all layers of slot indirection and returns the concrete value if available.
   * @throws {MissingSlotValueError}
   */
  unwrap<T>(eventual: Eventual<T>): T;
  resolve(item: Wgsl, slotValueOverrides?: SlotValuePair<unknown>[]): string;
  transpileFn(fn: string): {
    argNames: string[];
    body: Block;
    externalNames: string[];
  };
  fnToWgsl(options: FnToWgslOptions): {
    head: Wgsl;
    body: Wgsl;
  };
}

export interface TgpuResolvable {
  readonly label?: string | undefined;
  resolve(ctx: ResolutionCtx): string;
}

export function isResolvable(value: unknown): value is TgpuResolvable {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    'resolve' in value
  );
}

export function isWgsl(value: unknown): value is Wgsl {
  return (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    isResolvable(value)
  );
}

/**
 * Represents a value that is available at resolution time.
 */
export type Eventual<T> = T | TgpuSlot<T>;

export type EventualGetter = <T>(value: Eventual<T>) => T;

export type InlineResolve = (get: EventualGetter) => Wgsl;

export interface TgpuResolvableSlot<T extends Wgsl>
  extends TgpuResolvable,
    TgpuSlot<T> {}

export type SlotValuePair<T> = [TgpuSlot<T>, T];

export interface TgpuBindable<
  TData extends AnyTgpuData = AnyTgpuData,
  TUsage extends BufferUsage = BufferUsage,
> extends TgpuResolvable {
  readonly allocatable: unknown;
  readonly usage: TUsage;
}

export type TgpuSamplerType = 'sampler' | 'sampler_comparison';
export type TgpuTypedTextureType =
  | 'texture_1d'
  | 'texture_2d'
  | 'texture_2d_array'
  | 'texture_3d'
  | 'texture_cube'
  | 'texture_cube_array'
  | 'texture_multisampled_2d';
export type TgpuDepthTextureType =
  | 'texture_depth_2d'
  | 'texture_depth_2d_array'
  | 'texture_depth_cube'
  | 'texture_depth_cube_array'
  | 'texture_depth_multisampled_2d';
export type TgpuExternalTextureType = 'texture_external';

export type TgpuRenderResourceType =
  | TgpuSamplerType
  | TgpuTypedTextureType
  | TgpuDepthTextureType
  | TgpuExternalTextureType;

export interface TgpuRenderResource extends TgpuResolvable {
  readonly type: TgpuRenderResourceType;
}

export type BindableBufferUsage = 'uniform' | 'readonly' | 'mutable';
export type BufferUsage = 'uniform' | 'readonly' | 'mutable' | 'vertex';

export function isSamplerType(
  type: TgpuRenderResourceType,
): type is TgpuSamplerType {
  return type === 'sampler' || type === 'sampler_comparison';
}

export function isDepthTextureType(
  type: TgpuRenderResourceType,
): type is TgpuDepthTextureType {
  return [
    'texture_depth_2d',
    'texture_depth_2d_array',
    'texture_depth_cube',
    'texture_depth_cube_array',
    'texture_depth_multisampled_2d',
  ].includes(type);
}

export function isExternalTextureType(
  type: TgpuRenderResourceType,
): type is TgpuExternalTextureType {
  return type === 'texture_external';
}

export interface TgpuData<TInner> extends ISchema<TInner>, TgpuResolvable {
  readonly isLoose: false;
  readonly byteAlignment: number;
  readonly size: number;
}

export interface TgpuLooseData<TInner> extends ISchema<TInner> {
  readonly isLoose: true;
  readonly byteAlignment: number;
  readonly size: number;
}

export type AnyTgpuData = TgpuData<unknown>;
export type AnyTgpuLooseData = TgpuLooseData<unknown>;

export function isDataLoose<T>(
  data: TgpuData<T> | TgpuLooseData<T>,
): data is TgpuLooseData<T> {
  return data.isLoose;
}
export function isDataNotLoose<T>(
  data: TgpuData<T> | TgpuLooseData<T>,
): data is TgpuData<T> {
  return !data.isLoose;
}

export function isGPUBuffer(value: unknown): value is GPUBuffer {
  return (
    !!value &&
    typeof value === 'object' &&
    'getMappedRange' in value &&
    'mapAsync' in value
  );
}

// -----------------
// TypeGPU Resources
// -----------------

// Slot

export interface TgpuSlot<T> extends TgpuNamable {
  readonly __brand: 'TgpuSlot';

  readonly defaultValue: T | undefined;

  readonly label?: string | undefined;
  /**
   * Used to determine if code generated using either value `a` or `b` in place
   * of the slot will be equivalent. Defaults to `Object.is`.
   */
  areEqual(a: T, b: T): boolean;

  readonly value: T;
}

export function isSlot<T>(value: unknown | TgpuSlot<T>): value is TgpuSlot<T> {
  return (value as TgpuSlot<T>).__brand === 'TgpuSlot';
}
