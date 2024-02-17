import type { MemoryArena } from './memoryArena';

export type WGSLSegment = string | number | WGSLItem;

export interface IResolutionCtx {
  addDependency(item: WGSLItem): void;
  addMemory(memoryEntry: WGSLMemoryTrait): void;
  nameFor(token: WGSLItem): string;
  arenaFor(memoryEntry: WGSLMemoryTrait): MemoryArena | null;
  /** @throws {MissingBindingError}  */
  requireBinding<T>(bindable: WGSLBindableTrait<T>): T;
  tryBinding<T>(bindable: WGSLBindableTrait<T>, defaultValue: T): T;
  resolve(item: WGSLSegment): string;
}

export interface WGSLItem {
  readonly debugLabel?: string | undefined;

  resolve(ctx: IResolutionCtx): string;
}

export function isWGSLItem(value: unknown): value is WGSLItem {
  return !!value && typeof value === 'object' && 'resolve' in value;
}

export interface WGSLBindableTrait<TBinding> extends WGSLItem {
  /** type-token, not available at runtime */
  readonly __bindingType: TBinding;
}

export type WGSLBindPair<T> = [WGSLBindableTrait<T>, T];

export interface WGSLCompoundTrait extends WGSLItem {
  getChildren(ctx: IResolutionCtx): WGSLItem[];
}

export function hasCompoundTrait<T>(value: T): value is T & WGSLCompoundTrait {
  return !!value && typeof value === 'object' && 'getChildren' in value;
}

export interface WGSLMemoryTrait extends WGSLItem {
  readonly size: number;
  readonly baseAlignment: number;
  readonly structFieldDefinition: WGSLSegment;
}

export type MemoryLocation = { gpuBuffer: GPUBuffer; offset: number };
