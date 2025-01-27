import type { AnyWgslData } from '../../data';
import type { Exotic } from '../../data/exotic';
import { getResolutionCtx } from '../../gpuMode';
import type { Infer } from '../../shared/repr';
import {
  type ResolutionCtx,
  type SelfResolvable,
  isBufferUsage,
} from '../../types';
import type { TgpuBufferUsage } from '../buffer/bufferUsage';
import { type TgpuFn, isTgpuFn } from '../function/tgpuFn';
import { valueProxyHandler } from '../valueProxyUtils';
import { slot } from './slot';
import type { TgpuAccessor, TgpuSlot } from './slotTypes';

// ----------
// Public API
// ----------

export function accessor<T extends AnyWgslData>(
  schema: T,
  defaultValue?:
    | TgpuFn<[], Exotic<T>>
    | TgpuBufferUsage<Exotic<T>>
    | Infer<Exotic<T>>,
): TgpuAccessor<Exotic<T>> {
  return new TgpuAccessorImpl(schema as Exotic<T>, defaultValue);
}

// --------------
// Implementation
// --------------

export class TgpuAccessorImpl<T extends AnyWgslData>
  implements TgpuAccessor<T>, SelfResolvable
{
  readonly resourceType = 'accessor';
  '~repr' = undefined as Infer<T>;
  public label?: string | undefined;
  public slot: TgpuSlot<TgpuFn<[], T> | TgpuBufferUsage<T> | Infer<T>>;

  constructor(
    public readonly schema: T,
    public readonly defaultValue:
      | TgpuFn<[], T>
      | TgpuBufferUsage<T>
      | Infer<T>
      | undefined = undefined,
  ) {
    this.slot = slot(defaultValue);
  }

  $name(label: string) {
    this.label = label;
    this.slot.$name(label);
    return this;
  }

  toString(): string {
    return `accessor:${this.label ?? '<unnamed>'}`;
  }

  get value(): Infer<T> {
    const ctx = getResolutionCtx();
    if (!ctx) {
      throw new Error(
        `Cannot access tgpu.accessor's value outside of resolution.`,
      );
    }

    return new Proxy(
      {
        '~resolve': (ctx: ResolutionCtx) => ctx.resolve(this),
        toString: () => `.value:${this.label ?? '<unnamed>'}`,
      },
      valueProxyHandler,
    ) as Infer<T>;
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const value = ctx.unwrap(this.slot);

    if (isBufferUsage(value)) {
      return ctx.resolve(value);
    }

    if (isTgpuFn(value)) {
      return `${ctx.resolve(value)}()`;
    }

    return ctx.resolveValue(value as Infer<T>, this.schema);
  }
}
