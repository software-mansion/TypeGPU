import {
  type ResolutionCtx,
  type Wgsl,
  type WgslResolvable,
  type WgslResolvableSlot,
  type WgslSlot,
  isWgsl,
} from './types';

// ----------
// Public API
// ----------

export function slot<T extends Wgsl>(defaultValue?: T): WgslResolvableSlot<T>;

export function slot<T>(defaultValue?: T): WgslSlot<T>;

export function slot<T>(defaultValue?: T): WgslSlot<T> {
  return new WgslSlotImpl(defaultValue);
}

// --------------
// Implementation
// --------------

class WgslSlotImpl<T> implements WgslResolvable, WgslSlot<T> {
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
    const value = ctx.readSlot(this);

    if (!isWgsl(value)) {
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
