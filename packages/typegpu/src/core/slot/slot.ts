import { getExecutionCtx } from '../../gpuMode.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { Infer, InferGPU } from '../../shared/repr.ts';
import {
  $gpuRepr,
  $gpuValueOf,
  $internal,
  $repr,
} from '../../shared/symbols.ts';
import type { ExecutionCtx } from '../../executionCtx.ts';
import { getGpuValueRecursively } from '../valueProxyUtils.ts';
import type { TgpuSlot } from './slotTypes.ts';

// ----------
// Public API
// ----------

export function slot<T>(defaultValue?: T): TgpuSlot<T> {
  return new TgpuSlotImpl(defaultValue);
}

// --------------
// Implementation
// --------------

class TgpuSlotImpl<T> implements TgpuSlot<T> {
  public readonly [$internal] = true;
  public readonly resourceType = 'slot';

  // Type-tokens, not available at runtime
  declare readonly [$repr]: Infer<T>;
  declare readonly [$gpuRepr]: InferGPU<T>;
  // ---

  constructor(public defaultValue: T | undefined = undefined) {}

  $name(label: string) {
    setName(this, label);
    return this;
  }

  areEqual(a: T, b: T): boolean {
    return Object.is(a, b);
  }

  toString(): string {
    return `slot:${getName(this) ?? '<unnamed>'}`;
  }

  [$gpuValueOf](ctx: ExecutionCtx): InferGPU<T> {
    // For ResolutionCtx, use getGpuValueRecursively
    if ('resolve' in ctx) {
      return getGpuValueRecursively(ctx as any, ctx.unwrap(this));
    }
    // For ExecutionCtx, just unwrap
    return ctx.unwrap(this) as InferGPU<T>;
  }

  get value(): InferGPU<T> {
    const ctx = getExecutionCtx();
    if (!ctx) {
      throw new Error(`Cannot access tgpu.slot's value outside of execution context.`);
    }

    return this[$gpuValueOf](ctx);
  }

  get $(): InferGPU<T> {
    return this.value;
  }
}
