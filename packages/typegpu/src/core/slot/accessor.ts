import type { AnyWgslData } from '../../data/wgslTypes.ts';
import { getResolutionCtx } from '../../gpuMode.ts';
import { getName } from '../../name.ts';
import type { $repr, Infer } from '../../shared/repr.ts';
import { $internal, $labelForward } from '../../shared/symbols.ts';
import {
  isBufferUsage,
  type ResolutionCtx,
  type SelfResolvable,
} from '../../types.ts';
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
  defaultValue?: TgpuFn<[], T> | TgpuBufferUsage<T> | Infer<T>,
): TgpuAccessor<T> {
  return new TgpuAccessorImpl(schema, defaultValue);
}

// --------------
// Implementation
// --------------

export class TgpuAccessorImpl<T extends AnyWgslData>
  implements TgpuAccessor<T>, SelfResolvable {
  public readonly resourceType = 'accessor';
  declare public readonly [$repr]: Infer<T>;
  public slot: TgpuSlot<TgpuFn<[], T> | TgpuBufferUsage<T> | Infer<T>>;
  readonly [$labelForward]: TgpuSlot<
    TgpuFn<[], T> | TgpuBufferUsage<T> | Infer<T>
  >;

  constructor(
    public readonly schema: T,
    public readonly defaultValue:
      | TgpuFn<[], T>
      | TgpuBufferUsage<T>
      | Infer<T>
      | undefined = undefined,
  ) {
    this.slot = slot(defaultValue);
    this[$labelForward] = this.slot;
  }

  $name(label: string) {
    this.slot.$name(label);
    return this;
  }

  toString(): string {
    return `accessor:${getName(this) ?? '<unnamed>'}`;
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
        toString: () => `.value:${getName(this) ?? '<unnamed>'}`,
        [$internal]: {
          dataType: this.schema,
        },
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
