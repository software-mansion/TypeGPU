import type { ISchema, Unwrap } from 'typed-binary';
import type { TgpuBuffer } from './core/buffer/buffer';
import type { TgpuBufferUsage } from './core/buffer/bufferUsage';
import type { TgpuFnShellBase } from './core/function/fnCore';
import type { TgpuNamable } from './namable';
import type { Block } from './smol';

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
  [Symbol.iterator](): Iterator<number>;
}

/**
 * Removes properties from record type that extend `Prop`
 */
export type OmitProps<T extends Record<string, unknown>, Prop> = Pick<
  T,
  {
    [Key in keyof T]: T[Key] extends Prop ? never : Key;
  }[keyof T]
>;

/**
 * Passed into each resolvable item. All sibling items share a resolution ctx,
 * and a new resolution ctx is made when going down each level in the tree.
 */
export interface ResolutionCtx {
  addDeclaration(item: TgpuResolvable): void;
  addBinding(bindable: TgpuBindable, identifier: TgpuIdentifier): void;
  addRenderResource(
    resource: TgpuRenderResource,
    identifier: TgpuIdentifier,
  ): void;
  addBuiltin(builtin: symbol): void;
  nameFor(token: TgpuResolvable): string;
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
  fnToWgsl(
    // biome-ignore lint/suspicious/noExplicitAny: <no need for generic magic>
    shell: TgpuFnShellBase<any, AnyTgpuData | undefined>,
    argNames: string[],
    body: Block,
    externalMap: Record<string, unknown>,
  ): {
    head: Wgsl;
    body: Wgsl;
  };
}

export interface TgpuResolvable {
  readonly label?: string | undefined;
  resolve(ctx: ResolutionCtx): string;
}

export interface TgpuIdentifier extends TgpuNamable, TgpuResolvable {}

export interface Builtin {
  symbol: symbol;
  name: string;
  stage: 'vertex' | 'fragment' | 'compute';
  direction: 'input' | 'output';
  identifier: TgpuIdentifier;
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
  readonly allocatable: TgpuBuffer<TData>;
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

export type ValueOf<T> = T extends TgpuSlot<infer I>
  ? ValueOf<I>
  : T extends TgpuBufferUsage<infer D>
    ? ValueOf<D>
    : T extends TgpuData<unknown>
      ? Unwrap<T>
      : T;

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

// Code

export interface BoundTgpuCode extends TgpuResolvable {
  with<T>(slot: TgpuSlot<T>, value: Eventual<T>): BoundTgpuCode;
}

export interface TgpuCode extends BoundTgpuCode, TgpuNamable {}

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

  value: ValueOf<T>;
}

export function isSlot<T>(value: unknown | TgpuSlot<T>): value is TgpuSlot<T> {
  return (value as TgpuSlot<T>).__brand === 'TgpuSlot';
}
