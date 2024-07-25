import type { AnyWgslData } from './std140/types';
import type { WgslIdentifier } from './wgslIdentifier';
import type { F32, U32, I32 } from './std140';

export type Wgsl = string | number | WgslResolvable;

/**
 * Passed into each resolvable item. All sibling items share a resolution ctx,
 * and a new resolution ctx is made when going down each level in the tree.
 */
export interface ResolutionCtx {
  /**
   * Slots that were used by items resolved by this context.
   */
  readonly usedSlots: Iterable<WgslSlot<unknown>>;

  addDeclaration(item: WgslResolvable): void;
  addBinding(bindable: WgslBindable, identifier: WgslIdentifier): void;
  addRenderResource(
    resource: WgslRenderResource,
    identifier: WgslIdentifier,
  ): void;
  nameFor(token: WgslResolvable): string;
  /** @throws {MissingSlotValueError}  */
  readSlot<T>(slot: WgslSlot<T>): T;
  resolve(item: Wgsl, slotValueOverrides?: SlotValuePair<unknown>[]): string;
}

export interface WgslResolvable {
  readonly label?: string | undefined;

  resolve(ctx: ResolutionCtx): string;
}

export function isResolvable(value: unknown): value is WgslResolvable {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    'resolve' in value
  );
}

export function isWgsl(value: unknown): value is Wgsl {
  return (
    typeof value === 'number' ||
    typeof value === 'string' ||
    isResolvable(value)
  );
}

export interface WgslSlot<T> {
  readonly defaultValue: T | undefined;

  readonly label?: string | undefined;

  $name(label: string): WgslSlot<T>;

  /**
   * Used to determine if code generated using either value `a` or `b` in place
   * of the slot will be equivalent. Defaults to `Object.is`.
   */
  areEqual(a: T, b: T): boolean;
}

/**
 * Represents a value that is available at resolution time.
 * (constant after compilation)
 */
export type Potential<T> = T | WgslSlot<T>;

export interface WgslResolvableSlot<T extends Wgsl>
  extends WgslResolvable,
    WgslSlot<T> {
  $name(label: string): WgslResolvableSlot<T>;
}

export type SlotValuePair<T> = [WgslSlot<T>, T];

export interface WgslAllocatable<TData extends AnyWgslData = AnyWgslData> {
  /**
   * The data type this allocatable was constructed with.
   * It informs the size and format of data in both JS and
   * binary.
   */
  readonly dataType: TData;
  readonly flags: GPUBufferUsageFlags;
}

export interface WgslBindable<
  TData extends AnyWgslData = AnyWgslData,
  TUsage extends BufferUsage = BufferUsage,
> extends WgslResolvable {
  readonly allocatable: WgslAllocatable<TData>;
  readonly usage: TUsage;
}

export type WgslSamplerType = 'sampler' | 'sampler_comparison';
export type WgslTypedTextureType =
  | 'texture_1d'
  | 'texture_2d'
  | 'texture_2d_array'
  | 'texture_3d'
  | 'texture_cube'
  | 'texture_cube_array'
  | 'texture_multisampled_2d';
export type WgslDepthTextureType =
  | 'texture_depth_2d'
  | 'texture_depth_2d_array'
  | 'texture_depth_cube'
  | 'texture_depth_cube_array'
  | 'texture_depth_multisampled_2d';
export type WgslStorageTextureType =
  | 'texture_storage_1d'
  | 'texture_storage_2d'
  | 'texture_storage_2d_array'
  | 'texture_storage_3d';
export type WgslExternalTextureType = 'texture_external';

export type WgslRenderResourceType =
  | WgslSamplerType
  | WgslTypedTextureType
  | WgslDepthTextureType
  | WgslStorageTextureType
  | WgslExternalTextureType;

export interface WgslRenderResource<T extends WgslRenderResourceType>
  extends WgslResolvable {
  $name(label: string): WgslRenderResource<T>;
}

export type BufferUsage = 'uniform' | 'readonly_storage' | 'mutable_storage';
