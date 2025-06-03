import type { Snippet, TgpuDualFn } from '../data/dataTypes.ts';
import { inGPUMode } from '../gpuMode.ts';
import type { FnArgsConversionHint } from '../types.ts';
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

export function createDualImpl<T extends (...args: never[]) => unknown>(
  jsImpl: T,
  gpuImpl: (...args: MapValueToSnippet<Parameters<T>>) => Snippet,
  argTypes?: FnArgsConversionHint,
): TgpuDualFn<T> {
  const impl = ((...args: Parameters<T>) => {
    if (inGPUMode()) {
      return gpuImpl(...(args as MapValueToSnippet<Parameters<T>>)) as Snippet;
    }
    return jsImpl(...args);
  }) as T;

  (impl as TgpuDualFn<T>)[$internal] = {
    implementation: jsImpl,
    argTypes,
  };

  return impl as TgpuDualFn<T>;
}
