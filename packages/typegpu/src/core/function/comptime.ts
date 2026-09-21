import type { Snippet } from '../../data/snippet.ts';
import { WgslTypeError } from '../../errors.ts';
import { setName, type TgpuNamable } from '../../shared/meta.ts';
import { $getNameForward, $gpuCallable, $internal } from '../../shared/symbols.ts';
import { ArrayExpression, coerceToSnippet } from '../../tgsl/generationHelpers.ts';
import { type DualFn, isKnownAtComptime, NormalState } from '../../types.ts';

type AnyFn = (...args: never[]) => unknown;

/**
 * An array literal reaches a comptime function as an `ArrayExpression` — an
 * intermediate node holding element *snippets*, not values — so it has to be
 * inspected element by element instead of as a whole.
 *
 * Returns the values inside `snippet` that are only known at runtime, so an
 * array counts as comptime-known exactly when every one of its elements does.
 */
function runtimeKnownValues(snippet: Snippet): unknown[] {
  if (snippet.value instanceof ArrayExpression) {
    return snippet.value.elements.flatMap(runtimeKnownValues);
  }
  return isKnownAtComptime(snippet) ? [] : [snippet.value];
}

/**
 * Unwraps an `ArrayExpression` back into the plain JS array that was written in
 * the shader, so comptime functions see `[1, 2, 3]` instead of the generator's
 * intermediate representation.
 */
function toComptimeValue(snippet: Snippet): unknown {
  return snippet.value instanceof ArrayExpression
    ? snippet.value.elements.map(toComptimeValue)
    : snippet.value;
}

export type TgpuComptime<T extends AnyFn = AnyFn> = DualFn<T> &
  TgpuNamable & {
    [$getNameForward]: unknown;
    [$internal]: { isComptime: true };
  };

export function isComptimeFn(value: unknown): value is TgpuComptime {
  return !!(value as TgpuComptime)?.[$internal]?.isComptime;
}

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
 * const color = tgpu.comptime((int: number) => {
 *   const r = (int >> 16) & 0xff;
 *   const g = (int >> 8) & 0xff;
 *   const b = int & 0xff;
 *   return d.vec3f(r / 255, g / 255, b / 255);
 * });
 *
 * const material = (diffuse: d.v3f): d.v3f => {
 *   'use gpu';
 *   const albedo = color(0xff00ff);
 *   return albedo.mul(diffuse);
 * };
 * ```
 */
export function comptime<T extends (...args: never[]) => unknown>(func: T): TgpuComptime<T> {
  const impl = ((...args: Parameters<T>) => {
    return func(...args);
  }) as TgpuComptime<T>;

  impl.toString = () => 'comptime';
  impl[$getNameForward] = func;
  impl[$gpuCallable] = {
    call(ctx, args) {
      const runtimeKnown = args.flatMap(runtimeKnownValues);
      if (runtimeKnown.length > 0) {
        throw new WgslTypeError(
          `Called comptime function with runtime-known values: ${runtimeKnown
            .map((value) => `'${value}'`)
            .join(', ')}`,
        );
      }

      ctx.pushMode(new NormalState());
      try {
        return coerceToSnippet(func(...(args.map(toComptimeValue) as never[])));
      } finally {
        ctx.popMode();
      }
    },
  };
  impl.$name = (label: string) => {
    setName(func, label);
    return impl;
  };
  Object.defineProperty(impl, $internal, {
    value: { isComptime: true },
  });

  return impl;
}
