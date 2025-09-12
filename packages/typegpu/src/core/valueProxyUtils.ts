import type { AnyData } from '../data/dataTypes.ts';
import { snip, type Snippet } from '../data/snippet.ts';
import type { BaseData } from '../data/wgslTypes.ts';
import {
  extractGpuValueGetter,
  type GpuValueGetter,
} from '../extractGpuValueGetter.ts';
import { getName } from '../shared/meta.ts';
import {
  $internal,
  $ownSnippet,
  $providing,
  $runtimeResource,
  $wgslDataType,
} from '../shared/symbols.ts';
import { getTypeForPropAccess } from '../tgsl/generationHelpers.ts';
import type { ResolutionCtx } from '../types.ts';
import { stitch } from './resolve/stitch.ts';

export const valueProxyHandler: ProxyHandler<{
  readonly [$internal]: unknown;
  readonly [$wgslDataType]: BaseData;
  readonly [$runtimeResource]: true;
  readonly [$ownSnippet]?: Snippet | undefined;
  toString(): string;
}> = {
  get(target, prop) {
    if (prop in target) {
      return Reflect.get(target, prop);
    }

    if (prop === $ownSnippet) {
      return undefined;
    }

    if (prop === $providing) {
      return undefined;
    }

    if (
      prop === 'toString' ||
      prop === Symbol.toStringTag ||
      prop === Symbol.toPrimitive
    ) {
      return () => target.toString();
    }

    const propType = getTypeForPropAccess(
      target[$wgslDataType] as AnyData,
      String(prop),
    ) as AnyData;

    return new Proxy(
      {
        [$internal]: true,
        [$runtimeResource]: true,

        toString: () =>
          `.value(...).${String(prop)}:${getName(target) ?? '<unnamed>'}`,

        [$wgslDataType]: propType,
        get [$ownSnippet]() {
          return snip(stitch`${target[$ownSnippet]}.${String(prop)}`, propType);
        },
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
