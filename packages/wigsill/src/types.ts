import type { MemoryArena } from './memoryArena';
import type { AnyWgslData } from './std140/types';

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

  /**
   * Used to prevent cyclical code definitions.
   * TODO: Use to prevent cyclical code definitions.
   */
  readonly ancestors: Iterable<WgslResolvable>;

  addDeclaration(item: WgslResolvable): void;
  addAllocatable(allocatable: WgslAllocatable): void;
  nameFor(token: WgslResolvable): string;
  arenaFor(memoryEntry: WgslAllocatable): MemoryArena | null;
  /** @throws {MissingBindingError}  */
  readSlot<T>(slot: WgslSlot<T>): T;
  resolve(item: Wgsl, localBindings?: BindPair<unknown>[]): string;
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
  /** type-token, not available at runtime */
  readonly __bindingType: T;

  readonly defaultValue: T | undefined;

  readonly label?: string | undefined;

  $name(label: string): WgslSlot<T>;

  /**
   * Used to determine if code generated using either value `a` or `b` in place
   * of the bindable will be equivalent. Defaults to `Object.is`.
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

export type BindPair<T> = [WgslSlot<T>, T];

export interface WgslAllocatable<TData extends AnyWgslData = AnyWgslData>
  extends WgslResolvable {
  /**
   * The data type this allocatable was constructed with.
   * It informs the size and format of data in both JS and
   * binary.
   */
  readonly dataType: TData;

  /**
   * @deprecated to be removed along with memory arenas.
   */
  readonly structFieldDefinition: Wgsl;
}

export type MemoryLocation = { gpuBuffer: GPUBuffer; offset: number };
