import type { AnyData } from '../data/dataTypes.ts';
import type { BaseData } from '../data/wgslTypes.ts';
import {
  extractGpuValueGetter,
  type GpuValueGetter,
} from '../extractGpuValueGetter.ts';
import { getName } from '../name.ts';
import { $wgslDataType } from '../shared/symbols.ts';
import { getTypeForPropAccess } from '../tgsl/generationHelpers.ts';
import type { ResolutionCtx, SelfResolvable } from '../types.ts';

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

        [$wgslDataType]: getTypeForPropAccess(
          target[$wgslDataType] as AnyData,
          String(prop),
        ) as BaseData,
      },
      valueProxyHandler,
    );
  },
};

export function getGpuValueRecursively<T>(
  ctx: ResolutionCtx,
  value: unknown,
): T {
  let unwrapped = value;
  let valueGetter: GpuValueGetter | undefined;

  // biome-ignore lint/suspicious/noAssignInExpressions: it's exactly what we want biome
  while (valueGetter = extractGpuValueGetter(unwrapped)) {
    unwrapped = valueGetter(ctx);
  }

  return unwrapped as T;
}
