import { getResolutionCtx } from '../../gpuMode';
import type { Infer } from '../../shared/repr';
import type {
  Eventual,
  SlotValuePair,
  TgpuDerived,
  TgpuSlot,
} from './slotTypes';

// ----------
// Public API
// ----------

export function derived<T>(compute: () => T): TgpuDerived<T> {
  return createDerived(compute);
}

// --------------
// Implementation
// --------------

function createDerived<T>(compute: () => T): TgpuDerived<T> {
  const result = {
    resourceType: 'derived' as const,
    '~compute': compute,

    get value(): Infer<T> {
      const ctx = getResolutionCtx();
      if (!ctx) {
        throw new Error(
          `Cannot access tgpu.derived's value outside of resolution.`,
        );
      }

      const unwrapped = ctx.unwrap(this);
      return (unwrapped && typeof unwrapped === 'object' && 'value' in unwrapped
        ? unwrapped.value // TODO: user defined 'value' properties shouldn't be accessed here
        : unwrapped) as unknown as Infer<T>;
    },

    with<TValue>(
      slot: TgpuSlot<TValue>,
      value: Eventual<TValue>,
    ): TgpuDerived<T> {
      return createBoundDerived(compute, this, [slot, value]);
    },

    toString(): string {
      return 'derived';
    },
  };

  return result;
}

function createBoundDerived<T>(
  compute: () => T,
  innerDerived: TgpuDerived<T>,
  slotValuePair: SlotValuePair<unknown>,
): TgpuDerived<T> {
  const result = {
    resourceType: 'derived' as const,
    '~compute'() {
      const ctx = getResolutionCtx();
      if (!ctx) {
        throw new Error(
          `Cannot access tgpu.derived's value outside of resolution.`,
        );
      }

      return ctx.withSlots([slotValuePair], () => ctx.unwrap(innerDerived));
    },

    get value(): Infer<T> {
      const ctx = getResolutionCtx();
      if (!ctx) {
        throw new Error(
          `Cannot access tgpu.derived's value outside of resolution.`,
        );
      }

      const unwrapped = ctx.unwrap(this);
      return (unwrapped && typeof unwrapped === 'object' && 'value' in unwrapped
        ? unwrapped.value // TODO: user defined 'value' properties shouldn't be accessed here
        : unwrapped) as unknown as Infer<T>;
    },

    with<TValue>(
      slot: TgpuSlot<TValue>,
      value: Eventual<TValue>,
    ): TgpuDerived<T> {
      return createBoundDerived(compute, this, [slot, value]);
    },

    toString(): string {
      const [slot, value] = slotValuePair;
      return `derived[${slot.label ?? '<unnamed>'}=${value}]`;
    },
  };

  return result;
}
