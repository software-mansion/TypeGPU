import {
  type ResolutionCtx,
  type WGSLBindableTrait,
  type Wgsl,
  type WgslResolvable,
  isWgsl,
} from './types';

export interface Slot<T> {
  __brand: 'Slot';
  /** type-token, not available at runtime */
  __bindingType: T;

  alias(label: string): Slot<T>;
}

export interface ResolvableSlot<T extends Wgsl> extends WgslResolvable {
  __brand: 'Slot';
  /** type-token, not available at runtime */
  __bindingType: T;

  alias(label: string): ResolvableSlot<T>;
}

export class WGSLSlot<T> implements WgslResolvable, WGSLBindableTrait<T> {
  __bindingType!: T;
  __brand = 'Slot' as const;
  public debugLabel?: string | undefined;

  constructor(public defaultValue?: T) {}

  public alias(label: string) {
    this.debugLabel = label;
    return this;
  }

  private getValue(ctx: ResolutionCtx) {
    if (this.defaultValue !== undefined) {
      return ctx.tryBinding(this, this.defaultValue);
    }

    return ctx.requireBinding(this);
  }

  resolve(ctx: ResolutionCtx): string {
    const value = this.getValue(ctx);
    if (!isWgsl(value)) {
      throw new Error(
        `Cannot resolve value of type ${typeof value} for slot: ${this.debugLabel ?? '<unnamed>'}. Value is not valid WGSL.`,
      );
    }

    return ctx.resolve(value);
  }
}

export function slot<T extends Wgsl>(defaultValue?: T): ResolvableSlot<T>;

export function slot<T>(defaultValue?: T): Slot<T>;

export function slot<T>(defaultValue?: T): Slot<T> {
  return new WGSLSlot(defaultValue);
}
