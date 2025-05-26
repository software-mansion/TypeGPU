import type { AnyData } from '../data/dataTypes.ts';
import type { BaseData } from '../data/wgslTypes.ts';
import { getName } from '../name.ts';
import { $wgslDataType } from '../shared/symbols.ts';
import { getTypeForPropAccess } from '../tgsl/generationHelpers.ts';
import {
  isBufferUsage,
  type ResolutionCtx,
  type SelfResolvable,
} from '../types.ts';
import { isAccessor, isDerived, isSlot } from './slot/slotTypes.ts';

export const valueProxyHandler: ProxyHandler<
  & SelfResolvable
  & { readonly [$wgslDataType]: BaseData }
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
          `.value(...).${String(prop)}:${getName(target) ?? '<unnamed>'}`,

        get [$wgslDataType]() {
          return getTypeForPropAccess(
            target[$wgslDataType] as AnyData,
            String(prop),
          ) as BaseData;
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
