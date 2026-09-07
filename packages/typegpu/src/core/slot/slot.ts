import { getResolutionCtx } from '../../execMode.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { GPUValueOf } from '../../shared/repr.ts';
import { $gpuValueOf, $internal, $soul } from '../../shared/symbols.ts';
import { getGpuValueRecursively } from '../valueProxyUtils.ts';
import type { TgpuSlot, TgpuSlotSoul } from './slotTypes.ts';

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
  readonly [$internal] = true;
  readonly [$soul]: TgpuSlotSoul<T>;
  readonly resourceType = 'slot';

  constructor(defaultValue: T | undefined = undefined) {
    this[$soul] = {
      type: 'slot',
      defaultValue,
      label: undefined,
    };
  }

  get defaultValue(): T | undefined {
    return this[$soul].defaultValue;
  }

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

  get $(): GPUValueOf<T> {
    return this[$gpuValueOf];
  }
}
