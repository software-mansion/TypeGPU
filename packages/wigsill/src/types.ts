import type { WGSLCode } from './wgslCode';

export type WGSLSegment = string | number | WGSLItem;

export interface ResolutionCtx {
  addDependency(item: WGSLItem): void;
  nameFor(token: WGSLItem): string;
  /** @throws {MissingBindingError}  */
  requireBinding<T>(bindable: WGSLBindableTrait<T>): T;
  tryBinding<T>(bindable: WGSLBindableTrait<T>, defaultValue: T): T;
  resolve(item: WGSLSegment): string;
  registerMemory(memoryEntry: WGSLMemoryTrait): void;
}

export interface WGSLItem {
  readonly debugLabel?: string | undefined;

  resolve(ctx: ResolutionCtx): string;
}

export function isWGSLItem(value: unknown): value is WGSLItem {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    'resolve' in value
  );
}

export function isWGSLSegment(value: unknown): value is WGSLSegment {
  return (
    typeof value === 'number' || typeof value === 'string' || isWGSLItem(value)
  );
}

export interface WGSLBindableTrait<TBinding> {
  /** type-token, not available at runtime */
  readonly __bindingType: TBinding;

  readonly debugLabel?: string | undefined;
}

export type WGSLBindPair<T> = [WGSLBindableTrait<T>, T];

export interface WGSLMemoryTrait extends WGSLItem {
  readonly size: number;
  readonly baseAlignment: number;
  usage: 'uniform' | 'storage';
  flags: GPUBufferUsageFlags;
  definitionCode(bindingGroup: number, bindingIdx: number): WGSLCode;
}

export type MemoryLocation = { gpuBuffer: GPUBuffer; offset: number };
