import { $internal } from '../shared/symbols';
import type { BaseData } from '../data';
import { getTypeForPropAccess } from '../smol/generationHelpers';
import {
  type Labelled,
  type ResolutionCtx,
  type SelfResolvable,
  type Wgsl,
  isBufferUsage,
} from '../types';
import { isAccessor, isDerived, isSlot } from './slot/slotTypes';

export const valueProxyHandler: ProxyHandler<
  SelfResolvable &
    Labelled & { readonly [$internal]: { readonly dataType: BaseData } }
> = {
  get(target, prop) {
    if (prop in target) {
      return Reflect.get(target, prop);
    }

    if (prop === '~providing') {
      return undefined;
    }

    if (
      prop === 'toString' ||
      prop === Symbol.toStringTag ||
      prop === Symbol.toPrimitive
    ) {
      return () => target.toString();
    }

    return new Proxy(
      {
        '~resolve': (ctx: ResolutionCtx) =>
          `${ctx.resolve(target)}.${String(prop)}`,

        toString: () =>
          `.value(...).${String(prop)}:${target.label ?? '<unnamed>'}`,

        [$internal]: {
          dataType:
            getTypeForPropAccess(
              target[$internal].dataType as Wgsl,
              String(prop),
            ) ?? target[$internal].dataType,
        },
      },
      valueProxyHandler,
    );
  },
};

export function unwrapProxy<T>(value: unknown): T {
  let unwrapped = value;

  while (
    isSlot(unwrapped) ||
    isDerived(unwrapped) ||
    isAccessor(unwrapped) ||
    isBufferUsage(unwrapped)
  ) {
    unwrapped = unwrapped.value;
  }

  return unwrapped as T;
}
