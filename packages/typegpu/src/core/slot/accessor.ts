import type { AnyWgslData } from '../../data/wgslTypes.ts';
import { inCodegenMode } from '../../execMode.ts';
import { getName } from '../../shared/meta.ts';
import type { Infer, InferGPU } from '../../shared/repr.ts';
import {
  $getNameForward,
  $gpuRepr,
  $gpuValueOf,
  $internal,
  $repr,
  $wgslDataType,
} from '../../shared/symbols.ts';
import {
  isBufferUsage,
  type ResolutionCtx,
  type SelfResolvable,
} from '../../types.ts';
import { isBufferShorthand } from '../buffer/bufferShorthand.ts';
import type { TgpuBufferUsage } from '../buffer/bufferUsage.ts';
import { isTgpuFn, type TgpuFn } from '../function/tgpuFn.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';
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

  // Type-tokens, not available at runtime
  declare readonly [$repr]: Infer<T>;
  declare readonly [$gpuRepr]: InferGPU<T>;
  declare readonly [$getNameForward]: unknown;
  // ---

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

  $name(label: string) {
    this.slot.$name(label);
    return this;
  }

  toString(): string {
    return `accessor:${getName(this) ?? '<unnamed>'}`;
  }

  [$gpuValueOf](): InferGPU<T> {
    return new Proxy(
      {
        '~resolve': (ctx: ResolutionCtx) => ctx.resolve(this),
        toString: () => `.value:${getName(this) ?? '<unnamed>'}`,
        [$wgslDataType]: this.schema,
      },
      valueProxyHandler,
    ) as InferGPU<T>;
  }

  get value(): InferGPU<T> {
    if (inCodegenMode()) {
      return this[$gpuValueOf]();
    }

    throw new Error(
      '`tgpu.accessor` relies on GPU resources and cannot be accessed outside of a compute dispatch or draw call',
    );
  }

  get $(): InferGPU<T> {
    return this.value;
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const value = ctx.unwrap(this.slot);

    if (isBufferUsage(value) || isBufferShorthand(value)) {
      return ctx.resolve(value);
    }

    if (isTgpuFn(value)) {
      return `${ctx.resolve(value)}()`;
    }

    return ctx.resolveValue(value as Infer<T>, this.schema);
  }
}
