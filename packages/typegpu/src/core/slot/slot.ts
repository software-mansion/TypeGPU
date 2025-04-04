import { getResolutionCtx } from '../../gpuMode';
import type { $repr, Infer } from '../../shared/repr.js';
import { unwrapProxy } from '../valueProxyUtils';
import type { TgpuSlot } from './slotTypes';

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
  public readonly resourceType = 'slot';
  public label?: string | undefined;
  /** Type-token, not available at runtime */
  public declare readonly [$repr]: Infer<T>;

  constructor(public defaultValue: T | undefined = undefined) {}

  $name(label: string) {
    this.label = label;
    return this;
  }

  areEqual(a: T, b: T): boolean {
    return Object.is(a, b);
  }

  toString(): string {
    return `slot:${this.label ?? '<unnamed>'}`;
  }

  get value(): Infer<T> {
    const ctx = getResolutionCtx();
    if (!ctx) {
      throw new Error(`Cannot access tgpu.slot's value outside of resolution.`);
    }

    return unwrapProxy(ctx.unwrap(this));
  }
}
