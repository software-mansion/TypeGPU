import type { MemoryArena } from './memoryArena';

export type Wgsl = string | number | WgslResolvable;

export interface ResolutionCtx {
  addDependency(item: WgslResolvable): void;
  addMemory(memoryEntry: WGSLMemoryTrait): void;
  nameFor(token: WgslResolvable): string;
  arenaFor(memoryEntry: WGSLMemoryTrait): MemoryArena | null;
  /** @throws {MissingBindingError}  */
  requireBinding<T>(bindable: WGSLBindableTrait<T>): T;
  tryBinding<T>(bindable: WGSLBindableTrait<T>, defaultValue: T): T;
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

export interface WGSLBindableTrait<TBinding> {
  /** type-token, not available at runtime */
  readonly __bindingType: TBinding;

  readonly debugLabel?: string | undefined;
}

export type WGSLBindPair<T> = [WGSLBindableTrait<T>, T];

export interface WGSLMemoryTrait extends WgslResolvable {
  readonly size: number;
  readonly baseAlignment: number;
  readonly structFieldDefinition: Wgsl;
}

export type MemoryLocation = { gpuBuffer: GPUBuffer; offset: number };
