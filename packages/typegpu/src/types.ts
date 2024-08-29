import type { ISchema, Parsed } from 'typed-binary';
import type { F32, I32, U32, Vec4f, Vec4i, Vec4u } from './data';
import type { Builtin } from './wgslBuiltin';
import type { WgslIdentifier } from './wgslIdentifier';
import type { WgslPlum } from './wgslPlum';

export type Wgsl = string | number | WgslResolvable | symbol | boolean;

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
  addBuiltin(builtin: Builtin): void;
  nameFor(token: WgslResolvable): string;
  /**
   * Unwraps all layers of slot indirection and returns the concrete value if available.
   * @throws {MissingSlotValueError}
   */
  unwrap<T>(eventual: Eventual<T>): T;
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
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    isResolvable(value)
  );
}

export interface WgslSlot<T> {
  readonly __brand: 'WgslSlot';

  readonly defaultValue: T | undefined;

  readonly label?: string | undefined;

  $name(label: string): WgslSlot<T>;

  /**
   * Used to determine if code generated using either value `a` or `b` in place
   * of the slot will be equivalent. Defaults to `Object.is`.
   */
  areEqual(a: T, b: T): boolean;
}

export function isSlot<T>(value: unknown | WgslSlot<T>): value is WgslSlot<T> {
  return (value as WgslSlot<T>).__brand === 'WgslSlot';
}

/**
 * Represents a value that is available at resolution time.
 */
export type Eventual<T> = T | WgslSlot<T>;

export type EventualGetter = <T>(value: Eventual<T>) => T;

export type InlineResolve = (get: EventualGetter) => Wgsl;

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
  vertexLayout: Omit<GPUVertexBufferLayout, 'attributes'> | null;
  readonly initial?: Parsed<TData> | WgslPlum<Parsed<TData>> | undefined;
  readonly flags: GPUBufferUsageFlags;
  get label(): string | undefined;
}

export function isAllocatable(value: unknown): value is WgslAllocatable {
  return (
    !!value &&
    typeof value === 'object' &&
    'dataType' in value &&
    'flags' in value
  );
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

export interface WgslRenderResource extends WgslResolvable {
  readonly type: WgslRenderResourceType;
}

export type BufferUsage = 'uniform' | 'readonly' | 'mutable' | 'vertex';
export type TextureUsage = 'sampled' | 'storage';
export type StorageTextureAccess = 'read' | 'write' | 'read_write';

export type StorageTextureParams = {
  type: WgslStorageTextureType;
  access: StorageTextureAccess;
  descriptor?: GPUTextureViewDescriptor;
};
export type SampledTextureParams = {
  type: WgslTypedTextureType;
  dataType: AnyWgslPrimitive;
  descriptor?: GPUTextureViewDescriptor;
};

export function isSamplerType(
  type: WgslRenderResourceType,
): type is WgslSamplerType {
  return type === 'sampler' || type === 'sampler_comparison';
}

export function isTypedTextureType(
  type: WgslRenderResourceType,
): type is WgslTypedTextureType {
  return [
    'texture_1d',
    'texture_2d',
    'texture_2d_array',
    'texture_3d',
    'texture_cube',
    'texture_cube_array',
    'texture_multisampled_2d',
  ].includes(type);
}

export function isDepthTextureType(
  type: WgslRenderResourceType,
): type is WgslDepthTextureType {
  return [
    'texture_depth_2d',
    'texture_depth_2d_array',
    'texture_depth_cube',
    'texture_depth_cube_array',
    'texture_depth_multisampled_2d',
  ].includes(type);
}

export function isStorageTextureType(
  type: WgslRenderResourceType,
): type is WgslStorageTextureType {
  return [
    'texture_storage_1d',
    'texture_storage_2d',
    'texture_storage_2d_array',
    'texture_storage_3d',
  ].includes(type);
}

export function isExternalTextureType(
  type: WgslRenderResourceType,
): type is WgslExternalTextureType {
  return type === 'texture_external';
}

export interface WgslData<TInner> extends ISchema<TInner>, WgslResolvable {
  readonly byteAlignment: number;
  readonly size: number;
}

export type AnyWgslData = WgslData<unknown>;
export type AnyWgslPrimitive = U32 | I32 | F32;
export type AnyWgslTexelFormat = Vec4u | Vec4i | Vec4f;

export interface WgslPointer<
  TScope extends 'function',
  TInner extends AnyWgslData,
> {
  readonly scope: TScope;
  readonly pointsTo: TInner;
}

/**
 * A virtual representation of a WGSL value.
 */
export type WgslValue<TDataType> = {
  readonly __dataType: TDataType;
};

export type AnyWgslPointer = WgslPointer<'function', AnyWgslData>;

export type WgslFnArgument = AnyWgslPointer | AnyWgslData;

export function isPointer(
  value: AnyWgslPointer | AnyWgslData,
): value is AnyWgslPointer {
  return 'pointsTo' in value;
}
