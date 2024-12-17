import type { Block } from 'tinyest';
import {
  type Eventual,
  type SlotValuePair,
  isSlot,
} from './core/slot/slotTypes';
import type { AnyWgslData } from './data/wgslTypes';
import type { NameRegistry } from './nameRegistry';
import type {
  TgpuBindGroupLayout,
  TgpuLayoutEntry,
} from './tgpuBindGroupLayout';

export type Wgsl = Eventual<
  string | number | boolean | TgpuResolvable | AnyWgslData
>;

export const UnknownData = Symbol('Unknown data type');
export type UnknownData = typeof UnknownData;

export type Resource = {
  value: unknown;
  dataType: AnyWgslData | UnknownData;
};

export type TgpuShaderStage = 'compute' | 'vertex' | 'fragment';

export interface FnToWgslOptions {
  args: Resource[];
  returnType: AnyWgslData;
  body: Block;
  externalMap: Record<string, unknown>;
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
  allocateFixedEntry(
    layoutEntry: TgpuLayoutEntry,
    resource: object,
  ): {
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
  fnToWgsl(options: FnToWgslOptions): {
    head: Wgsl;
    body: Wgsl;
  };
}

export interface TgpuResolvable {
  readonly label?: string | undefined;
  resolve(ctx: ResolutionCtx): string;
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
    isResolvable(value) ||
    isSlot(value)
  );
}

export type BindableBufferUsage = 'uniform' | 'readonly' | 'mutable';
export type BufferUsage = 'uniform' | 'readonly' | 'mutable' | 'vertex';

export function isGPUBuffer(value: unknown): value is GPUBuffer {
  return (
    !!value &&
    typeof value === 'object' &&
    'getMappedRange' in value &&
    'mapAsync' in value
  );
}
