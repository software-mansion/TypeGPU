import type { AnyWgslData } from './std140/types';
import type { WgslIdentifier } from './wgslIdentifier';

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
  nameFor(token: WgslResolvable): string;
  /**
   * Unwraps all layers of slot indirection and returns the concrete value if available.
   * @throws {MissingSlotValueError}
   */
  unwrap<T>(eventual: Eventual<T>): T;
  resolve(item: Wgsl, slotValueOverrides?: SlotValuePair<unknown>[]): string;
}

export interface WgslResolvable {
  label: string;
  $name(label?: string | undefined): this;
  resolve(ctx: ResolutionCtx): string;
  toDebugRepr(): string;
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
  readonly __brand: 'WgslSlot';
  label: string;

  readonly defaultValue: T | undefined;

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
    WgslSlot<T> {}

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

export type BufferUsage = 'uniform' | 'readonly_storage' | 'mutable_storage';
