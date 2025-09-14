import { snip, type Snippet } from '../../data/snippet.ts';
import type { AnyWgslData } from '../../data/wgslTypes.ts';
import { getResolutionCtx, inCodegenMode } from '../../execMode.ts';
import { getName } from '../../shared/meta.ts';
import type { Infer, InferGPU } from '../../shared/repr.ts';
import {
  $getNameForward,
  $gpuValueOf,
  $internal,
  $resolve,
} from '../../shared/symbols.ts';
import type { ResolutionCtx } from '../../types.ts';
import type { TgpuBufferUsage } from '../buffer/bufferUsage.ts';
import { isTgpuFn, type TgpuFn } from '../function/tgpuFn.ts';
import { getGpuValueRecursively } from '../valueProxyUtils.ts';
import { slot } from './slot.ts';
import type { TgpuAccessor, TgpuSlot } from './slotTypes.ts';

// ----------
// Public API
// ----------

export function accessor<T extends AnyWgslData>(
  schema: T,
  defaultValue?: TgpuFn<() => T> | TgpuBufferUsage<T> | Infer<T>,
): TgpuAccessor<T> {
  return new TgpuAccessorImpl(schema, defaultValue);
}

// --------------
// Implementation
// --------------

export class TgpuAccessorImpl<T extends AnyWgslData>
  implements TgpuAccessor<T>, SelfResolvable {
  public readonly [$internal] = true;
  public readonly resourceType = 'accessor';
  public readonly slot: TgpuSlot<
    TgpuFn<() => T> | TgpuBufferUsage<T> | Infer<T>
  >;

  readonly [$getNameForward]: unknown;

  constructor(
    public readonly schema: T,
    public readonly defaultValue:
      | TgpuFn<() => T>
      | TgpuBufferUsage<T>
      | Infer<T>
      | undefined = undefined,
  ) {
    this.slot = slot(defaultValue);
    this[$getNameForward] = this.slot;
  }

  get [$gpuValueOf](): InferGPU<T> {
    // biome-ignore lint/style/noNonNullAssertion: it's there
    const ctx = getResolutionCtx()!;
    const value = getGpuValueRecursively(ctx.unwrap(this.slot));

    if (isTgpuFn(value)) {
      // It's a snippet, btw
      return value() as InferGPU<T>;
    }

    return snip(value, this.schema) as InferGPU<T>;
  }

  $name(label: string) {
    this.slot.$name(label);
    return this;
  }

  toString(): string {
    return `accessor:${getName(this) ?? '<unnamed>'}`;
  }

  get value(): InferGPU<T> {
    if (inCodegenMode()) {
      return this[$gpuValueOf];
    }

    throw new Error(
      '`tgpu.accessor` relies on GPU resources and cannot be accessed outside of a compute dispatch or draw call',
    );
  }

  get $(): InferGPU<T> {
    return this.value;
  }

  /**
   * This resolve is used when an accessor is referenced directly as an
   * external in a WGSL template. In other cases, it's the GPU value that
   * gets resolved.
   */
  [$resolve](ctx: ResolutionCtx): string {
    const snippet = this[$gpuValueOf] as Snippet;
    return ctx.resolve(snippet.value, this.schema);
  }
}
