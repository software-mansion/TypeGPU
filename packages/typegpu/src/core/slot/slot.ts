import { getResolutionCtx } from '../../execMode.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { GPUValueOf } from '../../shared/repr.ts';
import { $gpuValueOf, $internal } from '../../shared/symbols.ts';
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

  get [$gpuValueOf](): GPUValueOf<T> {
    const ctx = getResolutionCtx();
    if (!ctx) {
      throw new Error(`Cannot access tgpu.slot's value outside of resolution.`);
    }

    return getGpuValueRecursively(ctx.unwrap(this));
  }

  get value(): GPUValueOf<T> {
    return this[$gpuValueOf];
  }

  get $(): GPUValueOf<T> {
    return this.value;
  }
}
