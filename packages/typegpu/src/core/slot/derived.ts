import { getResolutionCtx } from '../../execMode.ts';
import { getName } from '../../shared/meta.ts';
import type { Infer, InferGPU } from '../../shared/repr.ts';
import {
  $gpuRepr,
  $gpuValueOf,
  $providing,
  $repr,
} from '../../shared/symbols.ts';
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
  if (getResolutionCtx()) {
    throw new Error(
      'Cannot create tgpu.derived objects at the resolution stage.',
    );
  }

  const result = {
    resourceType: 'derived' as const,
    '~compute': compute,
    [$repr]: undefined as Infer<T>,
    [$gpuRepr]: undefined as InferGPU<T>,

    [$gpuValueOf](ctx: ResolutionCtx): InferGPU<T> {
      return getGpuValueRecursively(ctx, ctx.unwrap(this));
    },

    get value(): InferGPU<T> {
      const ctx = getResolutionCtx();
      if (!ctx) {
        throw new Error(
          `Cannot access tgpu.derived's value outside of resolution.`,
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

    [$gpuValueOf](ctx: ResolutionCtx): InferGPU<T> {
      return getGpuValueRecursively(ctx, ctx.unwrap(this));
    },

    get value(): InferGPU<T> {
      const ctx = getResolutionCtx();
      if (!ctx) {
        throw new Error(
          `Cannot access tgpu.derived's value outside of resolution.`,
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
