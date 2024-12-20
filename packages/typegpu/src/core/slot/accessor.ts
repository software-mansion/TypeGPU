import type { AnyWgslData } from '../../data';
import type { Exotic } from '../../data/exotic';
import { getResolutionCtx } from '../../gpuMode';
import type { Infer } from '../../shared/repr';
import type { ResolutionCtx } from '../../types';
import { type TgpuBufferUsage, isBufferUsage } from '../buffer/bufferUsage';
import { type TgpuFn, isTgpuFn } from '../function/tgpuFn';
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
  implements TgpuAccessor<T>
{
  readonly resourceType = 'accessor';
  public label?: string | undefined;
  public slot: TgpuSlot<TgpuFn<[], T> | TgpuBufferUsage<T> | Infer<T>>;

  constructor(
    public schema: T,
    public defaultValue:
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

    return ctx.unwrap(this.slot) as unknown as Infer<T>;
  }

  resolve(ctx: ResolutionCtx): string {
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
