import {
  type Labelled,
  type ResolutionCtx,
  type SelfResolvable,
  isBufferUsage,
} from '../types';
import { isAccessor, isDerived, isSlot } from './slot/slotTypes';

export const valueProxyHandler: ProxyHandler<SelfResolvable & Labelled> = {
  get(target, prop) {
    if (prop in target) {
      return Reflect.get(target, prop);
    }

    if (prop === '~providing') {
      return undefined;
    }

    return new Proxy(
      {
        '~resolve': (ctx: ResolutionCtx) =>
          `${ctx.resolve(target)}.${String(prop)}`,

        toString: () =>
          `.value(...).${String(prop)}:${target.label ?? '<unnamed>'}`,
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
