import type { AnyData } from '../data/dataTypes.ts';
import { snip, type Snippet } from '../data/snippet.ts';
import { getGPUValue } from '../getGPUValue.ts';
import { $internal, $ownSnippet, $resolve } from '../shared/symbols.ts';
import { getTypeForPropAccess } from '../tgsl/generationHelpers.ts';
import {
  getOwnSnippet,
  type SelfResolvable,
  type WithOwnSnippet,
} from '../types.ts';

export const valueProxyHandler: ProxyHandler<
  SelfResolvable & WithOwnSnippet
> = {
  get(target, prop) {
    if (prop in target) {
      return Reflect.get(target, prop);
    }

    if (
      prop === 'toString' ||
      prop === Symbol.toStringTag ||
      prop === Symbol.toPrimitive
    ) {
      return () => target.toString();
    }

    if (typeof prop === 'symbol') {
      return undefined;
    }

    const targetSnippet = getOwnSnippet(target) as Snippet;
    const targetDataType = targetSnippet.dataType as AnyData;
    const propType = getTypeForPropAccess(targetDataType, String(prop));
    if (propType.type === 'unknown') {
      // Prop was not found, must be missing from this object
      return undefined;
    }

    return new Proxy({
      [$internal]: true,
      [$resolve]: (ctx) =>
        snip(`${ctx.resolve(target).value}.${String(prop)}`, propType),
      get [$ownSnippet]() {
        return snip(this, propType);
      },
      toString: () => `${String(target)}.${prop}`,
    }, valueProxyHandler);
  },
};

export function getGpuValueRecursively<T>(value: unknown): T {
  let unwrapped = value;

  while (true) {
    const gpuValue = getGPUValue(unwrapped);
    if (!gpuValue) {
      break;
    }
    unwrapped = gpuValue;
  }

  return unwrapped as T;
}
