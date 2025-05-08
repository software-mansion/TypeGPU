import { getResolutionCtx } from '../../gpuMode.ts';
import { $repr, type Infer } from '../../shared/repr.ts';
import { unwrapProxy } from '../valueProxyUtils.ts';
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
  return `${slot.label ?? '<unnamed>'}=${value}`;
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

    get value(): Infer<T> {
      const ctx = getResolutionCtx();
      if (!ctx) {
        throw new Error(
          `Cannot access tgpu.derived's value outside of resolution.`,
        );
      }

      return unwrapProxy(ctx.unwrap(this));
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
  if (getResolutionCtx()) {
    throw new Error(
      'Cannot create tgpu.derived objects at the resolution stage.',
    );
  }

  const result = {
    resourceType: 'derived' as const,
    [$repr]: undefined as Infer<T>,

    '~compute'() {
      throw new Error(
        `'~compute' should never be read on bound derived items.`,
      );
    },
    '~providing': {
      inner: innerDerived,
      pairs,
    },

    get value(): Infer<T> {
      const ctx = getResolutionCtx();
      if (!ctx) {
        throw new Error(
          `Cannot access tgpu.derived's value outside of resolution.`,
        );
      }

      return unwrapProxy(ctx.unwrap(this));
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
