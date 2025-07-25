import type {
  MapValueToSnippet,
  Snippet,
  TgpuDualFn,
} from '../data/dataTypes.ts';
import { inCodegenMode } from '../execMode.ts';
import type { FnArgsConversionHint } from '../types.ts';
import { setName } from './meta.ts';
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

export function createDualImpl<T extends (...args: never[]) => unknown>(
  jsImpl: T,
  gpuImpl: (...args: MapValueToSnippet<Parameters<T>>) => Snippet,
  name: string,
  argTypes?: FnArgsConversionHint,
): TgpuDualFn<T> {
  const impl = ((...args: Parameters<T>) => {
    if (inCodegenMode()) {
      return gpuImpl(...(args as MapValueToSnippet<Parameters<T>>)) as Snippet;
    }
    return jsImpl(...args);
  }) as T;

  setName(impl, name);
  impl.toString = () => name;
  (impl as TgpuDualFn<T>)[$internal] = { jsImpl, gpuImpl, argTypes };

  return impl as TgpuDualFn<T>;
}
