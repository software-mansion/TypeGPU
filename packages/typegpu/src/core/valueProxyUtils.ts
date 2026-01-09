import type { Snippet } from '../data/snippet.ts';
import { getGPUValue } from '../getGPUValue.ts';
import { $internal, $ownSnippet, $resolve } from '../shared/symbols.ts';
import { accessIndex } from '../tgsl/accessIndex.ts';
import { accessProp } from '../tgsl/accessProp.ts';
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

    const index = Number(prop);
    if (!Number.isNaN(index)) {
      const accessed = accessIndex(targetSnippet, index);
      if (!accessed) {
        // Prop was not found, must be missing from this object
        return undefined;
      }

      return new Proxy({
        [$internal]: true,
        [$resolve]: (ctx) => ctx.resolve(accessed.value, accessed.dataType),
        [$ownSnippet]: accessed,
        toString: () => `${String(target)}[${prop}]`,
      }, valueProxyHandler);
    }

    const accessed = accessProp(targetSnippet, String(prop));
    if (!accessed) {
      // Prop was not found, must be missing from this object
      return undefined;
    }

    return new Proxy({
      [$internal]: true,
      [$resolve]: (ctx) => ctx.resolve(accessed.value, accessed.dataType),
      [$ownSnippet]: accessed,
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
