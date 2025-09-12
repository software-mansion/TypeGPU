import type { AnyData } from '../data/dataTypes.ts';
import { snip, type Snippet } from '../data/snippet.ts';
import type { BaseData } from '../data/wgslTypes.ts';
import { getResolutionCtx } from '../execMode.ts';
import { extractGpuValueGetter } from '../extractGpuValueGetter.ts';
import { getName } from '../shared/meta.ts';
import {
  type $gpuValueOf,
  $internal,
  $ownSnippet,
  $providing,
  $runtimeResource,
  $wgslDataType,
} from '../shared/symbols.ts';
import { getTypeForPropAccess } from '../tgsl/generationHelpers.ts';
import {
  getOwnSnippet,
  type ResolutionCtx,
  type WithGPUValue,
  type WithOwnSnippet,
} from '../types.ts';
import { stitch } from './resolve/stitch.ts';

export const valueProxyHandler: ProxyHandler<
  WithOwnSnippet & {
    readonly [$internal]: unknown;
    readonly [$wgslDataType]: BaseData;
    readonly [$runtimeResource]: true;
    toString(): string;
  }
> = {
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

    // biome-ignore lint/style/noNonNullAssertion: it's there
    const ctx = getResolutionCtx()!;
    const targetSnippet = getOwnSnippet(ctx, target);
    const propType = getTypeForPropAccess(
      targetSnippet.dataType as AnyData,
      String(prop),
    ) as AnyData;

    return new Proxy(
      {
        [$internal]: true,
        [$runtimeResource]: true,

        toString: () =>
          `.value(...).${String(prop)}:${getName(target) ?? '<unnamed>'}`,

        [$wgslDataType]: propType,
        [$ownSnippet]: () =>
          snip(stitch`${targetSnippet}.${String(prop)}`, propType),
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
  let valueGetter: WithGPUValue<unknown>[typeof $gpuValueOf] | undefined;

  // biome-ignore lint/suspicious/noAssignInExpressions: it's exactly what we want biome
  while (valueGetter = extractGpuValueGetter(unwrapped)) {
    unwrapped = valueGetter(ctx);
  }

  return unwrapped as T;
}
