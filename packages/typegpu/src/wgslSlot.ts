import {
  type ResolutionCtx,
  type Tgpu,
  type TgpuResolvable,
  type TgpuResolvableSlot,
  type TgpuSlot,
  isTgpu,
} from './types';

// ----------
// Public API
// ----------

export function slot<T extends Tgpu>(defaultValue?: T): TgpuResolvableSlot<T>;

export function slot<T>(defaultValue?: T): TgpuSlot<T>;

export function slot<T>(defaultValue?: T): TgpuSlot<T> {
  return new TgpuSlotImpl(defaultValue);
}

// --------------
// Implementation
// --------------

class TgpuSlotImpl<T> implements TgpuResolvable, TgpuSlot<T> {
  readonly __brand = 'TgpuSlot';
  public label?: string | undefined;

  constructor(public defaultValue: T | undefined = undefined) {}

  public $name(label: string) {
    this.label = label;
    return this;
  }

  areEqual(a: T, b: T): boolean {
    return Object.is(a, b);
  }

  resolve(ctx: ResolutionCtx): string {
    const value = ctx.unwrap(this);

    if (!isTgpu(value)) {
      throw new Error(
        `Cannot inject value of type ${typeof value} of slot '${this.label ?? '<unnamed>'}' in code.`,
      );
    }

    return ctx.resolve(value);
  }

  toString(): string {
    return `slot:${this.label ?? '<unnamed>'}`;
  }
}
