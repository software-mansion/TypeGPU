import type { Block } from 'tinyest';
import type { ISchema, Unwrap } from 'typed-binary';
import type { TgpuBufferUsage } from './core/buffer/bufferUsage';
import type { TgpuFnShellBase } from './core/function/fnCore';
import type { TgpuNamable } from './namable';
import type { NameRegistry } from './nameRegistry';
import type { TgpuBindGroupLayout } from './tgpuBindGroupLayout';

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
  allocateFixedEntry(resource: object): {
    group: string;
    binding: number;
  };

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
    shell: TgpuFnShellBase<any, any>,
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

export type BindableBufferUsage = 'uniform' | 'readonly' | 'mutable';
export type BufferUsage = 'uniform' | 'readonly' | 'mutable' | 'vertex';

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
