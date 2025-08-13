import type { DualFn } from '../../data/dualFn.ts';
import type { MapValueToSnippet, Snippet } from '../../data/snippet.ts';
import { inCodegenMode } from '../../execMode.ts';
import type { FnArgsConversionHint } from '../../types.ts';
import { setName } from '../../shared/meta.ts';
import { $internal } from '../../shared/symbols.ts';

interface DualImplOptions<T extends (...args: never[]) => unknown> {
  name: string;
  normalImpl: T | string;
  codegenImpl: (...args: MapValueToSnippet<Parameters<T>>) => Snippet;
  /** @default 'keep' */
  args?: FnArgsConversionHint | undefined;
}

export function createDualImpl<T extends (...args: never[]) => unknown>(
  options: DualImplOptions<T>,
): DualFn<T> {
  const impl = ((...args: Parameters<T>) => {
    if (inCodegenMode()) {
      return options.codegenImpl(
        ...(args as MapValueToSnippet<Parameters<T>>),
      ) as Snippet;
    }
    if (typeof options.normalImpl === 'string') {
      throw new Error(options.normalImpl);
    }
    return options.normalImpl(...args);
  }) as T;

  setName(impl, options.name);
  impl.toString = () => options.name;
  Object.defineProperty(impl, $internal, {
    value: {
      jsImpl: options.normalImpl,
      gpuImpl: options.codegenImpl,
      argConversionHint: options.args,
    },
  });

  return impl as DualFn<T>;
}
