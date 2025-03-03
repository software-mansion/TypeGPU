import { inGPUMode } from '../gpuMode';
import type { Resource } from '../types';

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

type MapValueToResource<T> = { [K in keyof T]: Resource };

// biome-ignore lint/suspicious/noExplicitAny: <it's very convenient>
export function createDualImpl<T extends (...args: any[]) => any>(
  jsImpl: T,
  gpuImpl: (...args: MapValueToResource<Parameters<T>>) => Resource,
): T {
  return ((...args: Parameters<T>) => {
    if (inGPUMode()) {
      return gpuImpl(
        ...(args as unknown as MapValueToResource<Parameters<T>>),
      ) as unknown as Resource;
    }
    // biome-ignore lint/suspicious/noExplicitAny: <t's very convenient>
    return jsImpl(...(args as any));
  }) as T;
}
