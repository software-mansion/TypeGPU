import type { AnyData } from '../../data/dataTypes.ts';
import { getResolutionCtx } from '../../execMode.ts';
import { makeDereferenceable } from '../../tgsl/makeDereferenceable.ts';
import { makeResolvable } from '../../tgsl/makeResolvable.ts';
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

  static {
    TgpuLazyImpl.prototype.resourceType = 'lazy';

    makeDereferenceable(
      makeResolvable(TgpuLazyImpl.prototype, {
        asString: () => 'lazy',
        resolve(_ctx) {
          throw new Error(`Unreachable, is never resolved directly`);
        },
      }),
      {
        codegenMode: {
          get() {
            return this.#getValue();
          },
        },
        normalMode: {
          get() {
            return this.#getValue();
          },
        },
      },
    );
  }

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

  get $(): GPUValueOf<T> {
    return this[$gpuValueOf];
  }

  #getValue() {
    const ctx = getResolutionCtx();
    if (!ctx) {
      throw new Error(`Cannot access tgpu.lazy's value outside of resolution.`);
    }
    return getGpuValueRecursively(ctx.unwrap(this));
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
