import type { AnyData } from '../../data/dataTypes.ts';
import { getResolutionCtx } from '../../execMode.ts';
import type { GPUValueOf } from '../../shared/repr.ts';
import { $gpuValueOf, $internal, $providing } from '../../shared/symbols.ts';
import { getGpuValueRecursively } from '../valueProxyUtils.ts';
import {
  isAccessor,
  isMutableAccessor,
  type Providing,
  type TgpuAccessor,
  type TgpuLazy,
  type TgpuMutableAccessor,
  type TgpuSlot,
} from './slotTypes.ts';

// ----------
// Public API
// ----------

export function lazy<T>(compute: () => T): TgpuLazy<T> {
  if (getResolutionCtx()) {
    throw new Error('Cannot create tgpu.lazy objects during shader resolution.');
  }

  return new TgpuLazyImpl(compute, undefined);
}

// --------------
// Implementation
// --------------

class TgpuLazyImpl<out T> implements TgpuLazy<T> {
  readonly [$internal]: TgpuLazy<T>[typeof $internal];
  readonly [$providing]: Providing | undefined;

  // prototype properties
  declare resourceType: 'lazy';

  constructor(compute: () => T, providing: Providing | undefined) {
    this[$internal] = {
      compute,
    };
    this[$providing] = providing;
  }

  get [$gpuValueOf](): GPUValueOf<T> {
    const ctx = getResolutionCtx();
    if (!ctx) {
      throw new Error(`Cannot access tgpu.lazy's value outside of resolution.`);
    }
    return getGpuValueRecursively(ctx.unwrap(this));
  }

  get value(): GPUValueOf<T> {
    return this[$gpuValueOf];
  }

  get $(): GPUValueOf<T> {
    return this[$gpuValueOf];
  }

  toString(): string {
    return 'lazy';
  }

  with<TData extends AnyData>(
    slot: TgpuSlot<TData> | TgpuAccessor<TData> | TgpuMutableAccessor<TData>,
    value: TgpuAccessor.In<TData> | TgpuMutableAccessor.In<TData>,
  ): TgpuLazy<T> {
    return new TgpuLazyImpl(this[$internal].compute.bind(this), {
      inner: this[$providing]?.inner ?? this,
      pairs: [
        ...(this[$providing]?.pairs ?? []),
        [isAccessor(slot) || isMutableAccessor(slot) ? slot.slot : slot, value],
      ],
    });
  }
}

TgpuLazyImpl.prototype.resourceType = 'lazy';
