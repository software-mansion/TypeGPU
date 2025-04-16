import type { BaseData } from '../data/wgslTypes.ts';
import { $internal } from '../shared/symbols.ts';
import { getTypeForPropAccess } from '../tgsl/generationHelpers.ts';
import {
  type Labelled,
  type ResolutionCtx,
  type SelfResolvable,
  type Wgsl,
  isBufferUsage,
} from '../types.ts';
import { isAccessor, isDerived, isSlot } from './slot/slotTypes.ts';

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
          dataType: getTypeForPropAccess(
            target[$internal].dataType as Wgsl,
            String(prop),
          ) as BaseData,
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
