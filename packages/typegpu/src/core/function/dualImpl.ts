import type { TgpuDualFn } from '../../data/dataTypes.ts';
import type { MapValueToSnippet, Snippet } from '../../data/snippet.ts';
import { inCodegenMode } from '../../execMode.ts';
import type { FnArgsConversionHint } from '../../types.ts';
import { setName } from '../../shared/meta.ts';
import { $internal } from '../../shared/symbols.ts';

export function createDualImpl<T extends (...args: never[]) => unknown>(
  jsImpl: T,
  gpuImpl: (...args: MapValueToSnippet<Parameters<T>>) => Snippet,
  name: string,
  argConversionHint: FnArgsConversionHint = 'keep',
): TgpuDualFn<T> {
  const impl = ((...args: Parameters<T>) => {
    if (inCodegenMode()) {
      return gpuImpl(...(args as MapValueToSnippet<Parameters<T>>)) as Snippet;
    }
    return jsImpl(...args);
  }) as T;

  setName(impl, name);
  impl.toString = () => name;
  (impl as TgpuDualFn<T>)[$internal] = { jsImpl, gpuImpl, argConversionHint };

  return impl as TgpuDualFn<T>;
}
