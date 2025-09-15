import type { AnyData } from '../data/dataTypes.ts';
import { snip } from '../data/snippet.ts';
import { getGPUValue } from '../getGPUValue.ts';
import { $internal, $ownSnippet, $resolve } from '../shared/symbols.ts';
import { getTypeForPropAccess } from '../tgsl/generationHelpers.ts';
import type { SelfResolvable, WithOwnSnippet } from '../types.ts';

export const valueProxyHandler = (
  accessPath: string,
  targetDataType: AnyData,
): ProxyHandler<SelfResolvable & WithOwnSnippet> => ({
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

    const propType = getTypeForPropAccess(targetDataType, String(prop));
    if (propType.type === 'unknown') {
      // Prop was not found, must be missing from this object
      return undefined;
    }

    const deeperAccessPath = `${accessPath}.${prop}`;

    return new Proxy({
      [$internal]: true,
      [$resolve]: (ctx) => `${ctx.resolve(target)}.${String(prop)}`,
      get [$ownSnippet]() {
        return snip(this, propType);
      },
      toString: () => deeperAccessPath,
    }, valueProxyHandler(deeperAccessPath, propType));
  },
});

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
