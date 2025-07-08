import { getExecutionCtx } from '../../gpuMode.ts';
import { getName } from '../../shared/meta.ts';
import type { Infer, InferGPU } from '../../shared/repr.ts';
import {
  $gpuRepr,
  $gpuValueOf,
  $providing,
  $repr,
} from '../../shared/symbols.ts';
import type { ExecutionCtx } from '../../executionCtx.ts';
import type { ResolutionCtx } from '../../types.ts';
import { getGpuValueRecursively } from '../valueProxyUtils.ts';
import type {
  Eventual,
  SlotValuePair,
  TgpuDerived,
  TgpuSlot,
} from './slotTypes.ts';

// ----------
// Public API
// ----------

export function derived<T>(compute: () => T): TgpuDerived<T> {
  return createDerived(compute);
}

// --------------
// Implementation
// --------------

function stringifyPair([slot, value]: SlotValuePair): string {
  return `${getName(slot) ?? '<unnamed>'}=${value}`;
}

function createDerived<T>(compute: () => T): TgpuDerived<T> {
  if (getExecutionCtx()) {
    throw new Error(
      'Cannot create tgpu.derived objects during execution.',
    );
  }

  const result = {
    resourceType: 'derived' as const,
    '~compute': compute,
    [$repr]: undefined as Infer<T>,
    [$gpuRepr]: undefined as InferGPU<T>,

    [$gpuValueOf](ctx: ExecutionCtx | ResolutionCtx): InferGPU<T> {
      // For ResolutionCtx, use getGpuValueRecursively
      if ('resolve' in ctx) {
        return getGpuValueRecursively(ctx as ResolutionCtx, ctx.unwrap(this));
      }
      // For ExecutionCtx, just unwrap
      return ctx.unwrap(this) as InferGPU<T>;
    },

    get value(): InferGPU<T> {
      const ctx = getExecutionCtx();
      if (!ctx) {
        throw new Error(
          `Cannot access tgpu.derived's value outside of execution context.`,
        );
      }

      return this[$gpuValueOf](ctx);
    },

    get $(): InferGPU<T> {
      return this.value;
    },

    with<TValue>(
      slot: TgpuSlot<TValue>,
      value: Eventual<TValue>,
    ): TgpuDerived<T> {
      return createBoundDerived(this, [[slot, value]]);
    },

    toString(): string {
      return 'derived';
    },
  };

  return result;
}

function createBoundDerived<T>(
  innerDerived: TgpuDerived<T>,
  pairs: SlotValuePair[],
): TgpuDerived<T> {
  const result = {
    resourceType: 'derived' as const,
    [$repr]: undefined as Infer<T>,
    [$gpuRepr]: undefined as InferGPU<T>,

    '~compute'() {
      throw new Error(
        `'~compute' should never be read on bound derived items.`,
      );
    },
    [$providing]: {
      inner: innerDerived,
      pairs,
    },

    [$gpuValueOf](ctx: ExecutionCtx | ResolutionCtx): InferGPU<T> {
      // For ResolutionCtx, use getGpuValueRecursively
      if ('resolve' in ctx) {
        return getGpuValueRecursively(ctx as ResolutionCtx, ctx.unwrap(this));
      }
      // For ExecutionCtx, just unwrap
      return ctx.unwrap(this) as InferGPU<T>;
    },

    get value(): InferGPU<T> {
      const ctx = getExecutionCtx();
      if (!ctx) {
        throw new Error(
          `Cannot access tgpu.derived's value outside of execution context.`,
        );
      }

      return this[$gpuValueOf](ctx);
    },

    get $(): InferGPU<T> {
      return this.value;
    },

    with<TValue>(
      slot: TgpuSlot<TValue>,
      value: Eventual<TValue>,
    ): TgpuDerived<T> {
      return createBoundDerived(innerDerived, [...pairs, [slot, value]]);
    },

    toString(): string {
      return `derived[${pairs.map(stringifyPair).join(', ')}]`;
    },
  };

  return result;
}