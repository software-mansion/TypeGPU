import { getResolutionCtx } from '../../gpuMode';
import type { Infer } from '../../shared/repr';
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
  readonly resourceType = 'slot';
  public label?: string | undefined;
  '~repr' = undefined as Infer<T>;

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

    const unwrapped = ctx.unwrap(this);
    return (unwrapped && typeof unwrapped === 'object' && 'value' in unwrapped
      ? unwrapped.value // TODO: user defined 'value' properties shouldn't be accessed here
      : unwrapped) as unknown as Infer<T>;
  }
}
