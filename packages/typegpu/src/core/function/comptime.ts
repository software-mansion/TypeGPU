import type { DualFn } from '../../data/dualFn.ts';
import type { MapValueToSnippet } from '../../data/snippet.ts';
import { WgslTypeError } from '../../errors.ts';
import { inCodegenMode } from '../../execMode.ts';
import { $internal } from '../../shared/symbols.ts';
import { coerceToSnippet } from '../../tgsl/generationHelpers.ts';
import { isKnownAtComptime } from '../../types.ts';

export function comptime<T extends (...args: never[]) => unknown>(
  jsImpl: T,
): T {
  const gpuImpl = (...args: MapValueToSnippet<Parameters<T>>) => {
    const argSnippets = args as MapValueToSnippet<Parameters<T>>;

    if (!argSnippets.every((s) => isKnownAtComptime(s))) {
      throw new WgslTypeError(
        `Called comptime function with runtime-known values: ${
          argSnippets.filter((s) => !isKnownAtComptime(s)).map((s) =>
            `'${s.value}'`
          ).join(', ')
        }`,
      );
    }

    return coerceToSnippet(
      jsImpl(...argSnippets.map((s) => s.value) as never[]),
    );
  };

  const impl = ((...args: Parameters<T>) => {
    if (inCodegenMode()) {
      return gpuImpl(...args as MapValueToSnippet<Parameters<T>>);
    }
    return jsImpl(...args);
  }) as T;

  impl.toString = () => 'comptime';
  Object.defineProperty(impl, $internal, {
    value: {
      jsImpl,
      gpuImpl,
      argConversionHint: 'keep',
    },
  });

  return impl as DualFn<T>;
}
