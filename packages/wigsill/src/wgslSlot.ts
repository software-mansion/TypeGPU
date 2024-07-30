import {
  type ResolutionCtx,
  type Wgsl,
  type WgslNamable,
  type WgslResolvable,
  type WgslResolvableSlot,
  type WgslSlot,
  isWgsl,
} from './types';
import { WgslResolvableBase } from './wgslResolvableBase';

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

class WgslSlotImpl<T>
  extends WgslResolvableBase
  implements WgslResolvable, WgslNamable, WgslSlot<T>
{
  readonly typeInfo = 'slot';
  readonly __brand = 'WgslSlot';

  constructor(public defaultValue: T | undefined = undefined) {
    super();
  }

  areEqual(a: T, b: T): boolean {
    return Object.is(a, b);
  }

  resolve(ctx: ResolutionCtx): string {
    const value = ctx.unwrap(this);

    if (!isWgsl(value)) {
      throw new Error(
        `Cannot inject value of type ${typeof value} of slot '${this.label ?? '<unnamed>'}' in code.`,
      );
    }

    return ctx.resolve(value);
  }
}
