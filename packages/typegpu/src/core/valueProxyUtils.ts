import type { AnyData } from '../data/dataTypes.ts';
import { snip } from '../data/snippet.ts';
import { getGPUValue } from '../getGPUValue.ts';
import { getName } from '../shared/meta.ts';
import {
  $getNameForward,
  $gpuValueOf,
  $internal,
  $ownSnippet,
  $providing,
  $resolve,
  $runtimeResource,
} from '../shared/symbols.ts';
import { getTypeForPropAccess } from '../tgsl/generationHelpers.ts';
import type { SelfResolvable } from '../types.ts';

export const valueProxyHandler = (targetDataType: AnyData): ProxyHandler<
  SelfResolvable & {
    readonly [$runtimeResource]: true;
    readonly resourceType: 'access-proxy';
  }
> => ({
  get(target, prop) {
    if (prop in target) {
      return Reflect.get(target, prop);
    }

    // TODO: Check for typeof prop === 'symbol'
    if (
      prop === $resolve ||
      prop === $ownSnippet ||
      prop === $runtimeResource ||
      prop === $gpuValueOf ||
      prop === $internal ||
      prop === $providing ||
      prop === $getNameForward
    ) {
      return undefined;
    }

    if (
      prop === 'toString' ||
      prop === Symbol.toStringTag ||
      prop === Symbol.toPrimitive
    ) {
      return () => target.toString();
    }

    const propType = getTypeForPropAccess(targetDataType, String(prop));

    if (propType.type === 'unknown') {
      // Prop was not found, must be missing from this object
      return undefined;
    }

    return snip(
      new Proxy({
        [$internal]: true,
        [$runtimeResource]: true,
        resourceType: 'access-proxy',

        toString: () =>
          `.value(...).${String(prop)}:${getName(target) ?? '<unnamed>'}`,

        [$resolve]: (ctx) => `${ctx.resolve(target)}.${String(prop)}`,
      }, valueProxyHandler(propType)),
      propType,
    );
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
