import type { TgpuDualFn } from '../data/dataTypes.ts';
import type { AnyWgslData } from '../data/wgslTypes.ts';
import { inGPUMode } from '../gpuMode.ts';
import type { Snippet } from '../types.ts';
import { $internal } from './symbols.ts';

/**
 * Yields values in the sequence 0,1,2..∞ except for the ones in the `excluded` set.
 */
export function* naturalsExcept(
  excluded: Set<number>,
): Generator<number, number, unknown> {
  let next = 0;

  while (true) {
    if (!excluded.has(next)) {
      yield next;
    }

    next++;
  }
}

type MapValueToSnippet<T> = { [K in keyof T]: Snippet };

// biome-ignore lint/suspicious/noExplicitAny: <it's very convenient>
export function createDualImpl<T extends (...args: any[]) => any>(
  jsImpl: T,
  gpuImpl: (...args: MapValueToSnippet<Parameters<T>>) => Snippet,
  argTypes?:
    | AnyWgslData[]
    | Record<string, AnyWgslData>
    | ((...args: Snippet[]) => AnyWgslData[])
    | undefined,
): TgpuDualFn<T> {
  const impl = ((...args: Parameters<T>) => {
    if (inGPUMode()) {
      return gpuImpl(
        ...(args as unknown as MapValueToSnippet<Parameters<T>>),
      ) as unknown as Snippet;
    }
    // biome-ignore lint/suspicious/noExplicitAny: <it's very convenient>
    return jsImpl(...(args as any));
  }) as T;

  Object.defineProperty(impl, $internal, {
    value: {
      implementation: jsImpl,
      argTypes,
    },
  });

  return impl as TgpuDualFn<T>;
}
