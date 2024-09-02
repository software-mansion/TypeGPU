import type { ISchema, Parsed } from 'typed-binary';
import type { F32, I32, U32, Vec4f, Vec4i, Vec4u } from './data';
import type { Builtin } from './wgslBuiltin';
import type { TgpuIdentifier } from './wgslIdentifier';
import type { TgpuPlum } from './wgslPlum';

export type Tgpu = string | number | TgpuResolvable | symbol | boolean;

/**
 * Passed into each resolvable item. All sibling items share a resolution ctx,
 * and a new resolution ctx is made when going down each level in the tree.
 */
export interface ResolutionCtx {
  /**
   * Slots that were used by items resolved by this context.
   */
  readonly usedSlots: Iterable<TgpuSlot<unknown>>;

  addDeclaration(item: TgpuResolvable): void;
  addBinding(bindable: TgpuBindable, identifier: TgpuIdentifier): void;
  addRenderResource(
    resource: TgpuRenderResource,
    identifier: TgpuIdentifier,
  ): void;
  addBuiltin(builtin: Builtin): void;
  nameFor(token: TgpuResolvable): string;
  /**
   * Unwraps all layers of slot indirection and returns the concrete value if available.
   * @throws {MissingSlotValueError}
   */
  unwrap<T>(eventual: Eventual<T>): T;
  resolve(item: Tgpu, slotValueOverrides?: SlotValuePair<unknown>[]): string;
}

export interface TgpuResolvable {
  readonly label?: string | undefined;
  resolve(ctx: ResolutionCtx): string;
}

export interface TgpuNamable {
  $name(label?: string | undefined): this;
}

export function isResolvable(value: unknown): value is TgpuResolvable {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    'resolve' in value
  );
}

export function isTgpu(value: unknown): value is Tgpu {
  return (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    isResolvable(value)
  );
}

export interface TgpuSlot<T> extends TgpuNamable {
  readonly __brand: 'TgpuSlot';

  readonly defaultValue: T | undefined;

  readonly label?: string | undefined;
  /**
   * Used to determine if code generated using either value `a` or `b` in place
   * of the slot will be equivalent. Defaults to `Object.is`.
   */
  areEqual(a: T, b: T): boolean;
}

export function isSlot<T>(value: unknown | TgpuSlot<T>): value is TgpuSlot<T> {
  return (value as TgpuSlot<T>).__brand === 'TgpuSlot';
}

/**
 * Represents a value that is available at resolution time.
 */
export type Eventual<T> = T | TgpuSlot<T>;

export type EventualGetter = <T>(value: Eventual<T>) => T;

export type InlineResolve = (get: EventualGetter) => Tgpu;

export interface TgpuResolvableSlot<T extends Tgpu>
  extends TgpuResolvable,
    TgpuSlot<T> {}

export type SlotValuePair<T> = [TgpuSlot<T>, T];

export interface TgpuAllocatable<TData extends AnyTgpuData = AnyTgpuData> {
  /**
   * The data type this allocatable was constructed with.
   * It informs the size and format of data in both JS and
   * binary.
   */
  readonly dataType: TData;
  vertexLayout: Omit<GPUVertexBufferLayout, 'attributes'> | null;
  readonly initial?: Parsed<TData> | TgpuPlum<Parsed<TData>> | undefined;
  readonly flags: GPUBufferUsageFlags;
}

export function isAllocatable(value: unknown): value is TgpuAllocatable {
  return (
    !!value &&
    typeof value === 'object' &&
    'dataType' in value &&
    'flags' in value
  );
}

export interface TgpuBindable<
  TData extends AnyTgpuData = AnyTgpuData,
  TUsage extends BufferUsage = BufferUsage,
> extends TgpuResolvable {
  readonly allocatable: TgpuAllocatable<TData>;
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
export type TgpuStorageTextureType =
  | 'texture_storage_1d'
  | 'texture_storage_2d'
  | 'texture_storage_2d_array'
  | 'texture_storage_3d';
export type TgpuExternalTextureType = 'texture_external';

export type TgpuRenderResourceType =
  | TgpuSamplerType
  | TgpuTypedTextureType
  | TgpuDepthTextureType
  | TgpuStorageTextureType
  | TgpuExternalTextureType;

export interface TgpuRenderResource extends TgpuResolvable {
  readonly type: TgpuRenderResourceType;
}

export type BufferUsage = 'uniform' | 'readonly' | 'mutable' | 'vertex';
export type TextureUsage = 'sampled' | 'storage';
export type StorageTextureAccess = 'read' | 'write' | 'read_write';

export type StorageTextureParams = {
  type: TgpuStorageTextureType;
  access: StorageTextureAccess;
  descriptor?: GPUTextureViewDescriptor;
};
export type SampledTextureParams = {
  type: TgpuTypedTextureType;
  dataType: AnyTgpuPrimitive;
  descriptor?: GPUTextureViewDescriptor;
};

export function isSamplerType(
  type: TgpuRenderResourceType,
): type is TgpuSamplerType {
  return type === 'sampler' || type === 'sampler_comparison';
}

export function isTypedTextureType(
  type: TgpuRenderResourceType,
): type is TgpuTypedTextureType {
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

export function isStorageTextureType(
  type: TgpuRenderResourceType,
): type is TgpuStorageTextureType {
  return [
    'texture_storage_1d',
    'texture_storage_2d',
    'texture_storage_2d_array',
    'texture_storage_3d',
  ].includes(type);
}

export function isExternalTextureType(
  type: TgpuRenderResourceType,
): type is TgpuExternalTextureType {
  return type === 'texture_external';
}

export interface TgpuData<TInner> extends ISchema<TInner>, TgpuResolvable {
  readonly byteAlignment: number;
  readonly size: number;
}

export type AnyTgpuData = TgpuData<unknown>;
export type AnyTgpuPrimitive = U32 | I32 | F32;
export type AnyTgpuTexelFormat = Vec4u | Vec4i | Vec4f;

export interface TgpuPointer<
  TScope extends 'function',
  TInner extends AnyTgpuData,
> {
  readonly scope: TScope;
  readonly pointsTo: TInner;
}

/**
 * A virtual representation of a WGSL value.
 */
export type TgpuValue<TDataType> = {
  readonly __dataType: TDataType;
};

export type AnyTgpuPointer = TgpuPointer<'function', AnyTgpuData>;

export type TgpuFnArgument = AnyTgpuPointer | AnyTgpuData;

export function isPointer(
  value: AnyTgpuPointer | AnyTgpuData,
): value is AnyTgpuPointer {
  return 'pointsTo' in value;
}
