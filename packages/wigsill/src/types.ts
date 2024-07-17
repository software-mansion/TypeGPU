import type { MemoryArena } from './memoryArena';
import type { AnyWgslData } from './std140/types';

export type Wgsl = string | number | WgslResolvable;

export interface ResolutionCtx {
  addDependency(item: WgslResolvable): void;
  addAllocatable(allocatable: WgslAllocatable<AnyWgslData>): void;
  nameFor(token: WgslResolvable): string;
  arenaFor(memoryEntry: WgslAllocatable<AnyWgslData>): MemoryArena | null;
  /** @throws {MissingBindingError}  */
  requireBinding<T>(bindable: WgslBindable<T>): T;
  tryBinding<T>(bindable: WgslBindable<T>, defaultValue: T): T;
  resolve(item: Wgsl): string;
}

export interface WgslResolvable {
  readonly debugLabel?: string | undefined;

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

export interface WgslBindable<TBinding> {
  /** type-token, not available at runtime */
  readonly __bindingType: TBinding;

  readonly debugLabel?: string | undefined;
}

export type WGSLBindPair<T> = [WgslBindable<T>, T];

export interface WgslAllocatable<TData extends AnyWgslData>
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
