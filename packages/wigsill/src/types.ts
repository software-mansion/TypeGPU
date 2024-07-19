import type { AnyWgslData } from './std140/types';
import type { WgslBufferUsage } from './wgslBufferUsage';

export type Wgsl = string | number | WgslResolvable;

export interface ResolutionCtx {
  addDependency(item: WgslResolvable): void;
  addAllocatable(allocatable: WgslAllocatable): void;
  nameFor(token: WgslResolvable): string;
  /** @throws {MissingBindingError}  */
  requireBinding<T>(bindable: WgslBindable<T>): T;
  tryBinding<T>(bindable: WgslBindable<T>, defaultValue: T): T;
  resolve(item: Wgsl): string;
  addBufferUsage<TData extends AnyWgslData, TUsage extends BufferUsage>(
    bufferUsage: WgslBufferUsage<TData, TUsage>,
  ): void;
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

export type BindPair<T> = [WgslBindable<T>, T];

export interface WgslAllocatable<TData extends AnyWgslData = AnyWgslData>
  extends WgslResolvable {
  /**
   * The data type this allocatable was constructed with.
   * It informs the size and format of data in both JS and
   * binary.
   */
  readonly dataType: TData;
  flags: GPUBufferUsageFlags;
  definitionCode(bindingGroup: number, bindingIdx: number): WgslResolvable;
}

export type BufferUsage = 'uniform' | 'readonlyStorage' | 'mutableStorage';

export type MemoryLocation = { gpuBuffer: GPUBuffer; offset: number };
