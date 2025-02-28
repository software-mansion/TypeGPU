import type { BaseData } from '../data';
import { getTypeForPropAccess } from '../shared/helpers';
import {
  type Labelled,
  type ResolutionCtx,
  type SelfResolvable,
  type Wgsl,
  isBufferUsage,
} from '../types';
import { isAccessor, isDerived, isSlot } from './slot/slotTypes';

export const valueProxyHandler: ProxyHandler<
  SelfResolvable & Labelled & { dataType: BaseData }
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

        dataType:
          getTypeForPropAccess(target.dataType as Wgsl, String(prop)) ??
          target.dataType,
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
