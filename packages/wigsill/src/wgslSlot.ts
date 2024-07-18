import {
  type ResolutionCtx,
  type Wgsl,
  type WgslBindable,
  type WgslResolvable,
  isWgsl,
} from './types';

// ----------
// Public API
// ----------

export interface WgslSlot<T> extends WgslBindable<T> {
  $name(label: string): WgslSlot<T>;
}

/**
 * Represents a value that is available at resolution time.
 * (constant after compilation)
 */
export type Potential<T> = T | WgslSlot<T>;

export interface WgslResolvableSlot<T extends Wgsl>
  extends WgslResolvable,
    WgslSlot<T> {
  $name(label: string): WgslResolvableSlot<T>;
}

export function slot<T extends Wgsl>(defaultValue?: T): WgslResolvableSlot<T>;

export function slot<T>(defaultValue?: T): WgslSlot<T>;

export function slot<T>(defaultValue?: T): WgslSlot<T> {
  return new WgslSlotImpl(defaultValue);
}

// --------------
// Implementation
// --------------

class WgslSlotImpl<T> implements WgslResolvable, WgslBindable<T> {
  __bindingType!: T;
  public debugLabel?: string | undefined;

  constructor(public defaultValue?: T) {}

  public $name(label: string) {
    this.debugLabel = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    let value: T;
    if (this.defaultValue !== undefined) {
      value = ctx.tryBinding(this, this.defaultValue);
    } else {
      value = ctx.requireBinding(this);
    }

    if (!isWgsl(value)) {
      throw new Error(
        `Cannot resolve value of type ${typeof value} for slot: ${this.debugLabel ?? '<unnamed>'}. Value is not valid WGSL.`,
      );
    }

    return ctx.resolve(value);
  }
}
