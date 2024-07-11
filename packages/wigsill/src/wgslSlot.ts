import {
  ResolutionCtx,
  WGSLBindableTrait,
  WGSLItem,
  WGSLSegment,
  isWGSLSegment,
} from './types';

export interface Slot<T> {
  __brand: 'Slot';
  /** type-token, not available at runtime */
  __bindingType: T;
}

export interface ResolvableSlot<T extends WGSLSegment> extends WGSLItem {
  __brand: 'Slot';
  /** type-token, not available at runtime */
  __bindingType: T;
}

export class WGSLSlot<T> implements WGSLItem, WGSLBindableTrait<T> {
  __bindingType!: T;
  __brand = 'Slot' as const;
  public debugLabel?: string | undefined;

  constructor(public defaultValue?: T) {}

  public alias(debugLabel: string) {
    this.debugLabel = debugLabel;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const value = this.defaultValue
      ? ctx.tryBinding(this, this.defaultValue)
      : ctx.requireBinding(this);

    if (!isWGSLSegment(value)) {
      throw new Error(
        `Cannot resolve value of type ${typeof value} for slot: ${this.debugLabel ?? '<unnamed>'}, type WGSLSegment required`,
      );
    }

    return ctx.resolve(value);
  }
}

export function slot<T extends WGSLSegment>(
  defaultValue?: T,
): ResolvableSlot<T>;

export function slot<T>(defaultValue?: T): Slot<T>;

export function slot<T>(defaultValue?: T): Slot<T> {
  return new WGSLSlot(defaultValue);
}
