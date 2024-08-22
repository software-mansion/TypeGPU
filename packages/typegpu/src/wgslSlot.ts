import { namable, resolvable } from './decorators';
import {
  type ResolutionCtx,
  type Wgsl,
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
  return makeSlot(defaultValue);
}

// --------------
// Implementation
// --------------

function resolveSlot<T>(this: WgslSlot<T>, ctx: ResolutionCtx): string {
  const value = ctx.unwrap(this);

  if (!isWgsl(value)) {
    throw new Error(
      `Cannot inject value of type ${typeof value} of slot '${this.label ?? '<unnamed>'}' in code.`,
    );
  }

  return ctx.resolve(value);
}

const makeSlot = <T>(defaultValue: T | undefined) =>
  namable(
    resolvable(
      { typeInfo: 'slot' },
      {
        __brand: 'WgslSlot' as const,
        defaultValue,
        resolve: resolveSlot,

        areEqual(a: T, b: T): boolean {
          return Object.is(a, b);
        },
      },
    ),
  );
