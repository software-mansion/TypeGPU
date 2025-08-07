import type { TgpuDualFn } from '../../data/dataTypes.ts';
import type { MapValueToSnippet, Snippet } from '../../data/snippet.ts';
import { getResolutionCtx } from '../../execMode.ts';
import type { FnArgsConversionHint, ResolutionCtx } from '../../types.ts';
import { setName } from '../../shared/meta.ts';
import { $internal } from '../../shared/symbols.ts';

export function createDualImpl<T extends (...args: never[]) => unknown>(
  jsImpl: T,
  gpuImpl: (
    ctx: ResolutionCtx,
    ...args: MapValueToSnippet<Parameters<T>>
  ) => Snippet,
  name: string,
  argConversionHint: FnArgsConversionHint = 'keep',
): TgpuDualFn<T> {
  const impl = ((...args: Parameters<T>) => {
    const ctx = getResolutionCtx();
    if (ctx?.mode.type === 'codegen') {
      return gpuImpl(ctx, ...(args as MapValueToSnippet<Parameters<T>>));
    }
    return jsImpl(...args);
  }) as T;

  setName(impl, name);
  impl.toString = () => name;
  (impl as TgpuDualFn<T>)[$internal] = { jsImpl, gpuImpl, argConversionHint };

  return impl as TgpuDualFn<T>;
}
