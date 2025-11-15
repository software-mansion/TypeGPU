import type { DualFn } from '../../data/dualFn.ts';
import type { MapValueToSnippet } from '../../data/snippet.ts';
import { WgslTypeError } from '../../errors.ts';
import { inCodegenMode } from '../../execMode.ts';
import { $internal } from '../../shared/symbols.ts';
import { coerceToSnippet } from '../../tgsl/generationHelpers.ts';
import { isKnownAtComptime } from '../../types.ts';

/**
 * Creates a version of `func` that can called safely in a TypeGPU function to
 * precompute and inject a value into the final shader code.
 *
 * Note how the function passed into `comptime` doesn't have to be marked with
 * 'use gpu'. That's because the function doesn't execute on the GPU, it gets
 * executed before the shader code gets sent to the GPU.
 *
 * @example
 * ```ts
 * const injectRand01 = tgpu['~unstable']
 *   .comptime(() => Math.random());
 *
 * const getColor = (diffuse: d.v3f) => {
 *   'use gpu';
 *   const albedo = hsvToRgb(injectRand01(), 1, 0.5);
 *   return albedo.mul(diffuse);
 * };
 * ```
 */
export function comptime<T extends (...args: never[]) => unknown>(
  func: T,
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

    return coerceToSnippet(func(...argSnippets.map((s) => s.value) as never[]));
  };

  const impl = ((...args: Parameters<T>) => {
    if (inCodegenMode()) {
      return gpuImpl(...args as MapValueToSnippet<Parameters<T>>);
    }
    return func(...args);
  }) as T;

  impl.toString = () => 'comptime';
  Object.defineProperty(impl, $internal, {
    value: {
      jsImpl: func,
      gpuImpl,
      argConversionHint: 'keep',
    },
  });

  return impl as DualFn<T>;
}
