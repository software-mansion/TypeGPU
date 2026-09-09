import { WgslTypeError } from '../../errors.ts';
import { setName, type TgpuNamable } from '../../shared/meta.ts';
import { $getNameForward, $gpuCallable, $internal } from '../../shared/symbols.ts';
import { coerceToSnippet } from '../../tgsl/generationHelpers.ts';
import { type DualFn, isKnownAtComptime, NormalState } from '../../types.ts';

type AnyFn = (...args: never[]) => unknown;

export type TgpuComptime<T extends AnyFn = AnyFn> = DualFn<T> &
  TgpuNamable & {
    toString(): string;
    [$getNameForward]: unknown;
    [$internal]: { isComptime: true; func: T };
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

  Object.setPrototypeOf(impl, ComptimePrototype);

  impl[$getNameForward] = func;
  Object.defineProperty(impl, $internal, {
    value: { isComptime: true, func },
  });

  return impl;
}

const ComptimePrototype = {
  toString() {
    return 'comptime';
  },

  $name(label: string) {
    setName(this[$internal].func, label);
    return this;
  },

  [$gpuCallable](ctx, args) {
    if (!args.every((s) => isKnownAtComptime(s))) {
      throw new WgslTypeError(
        `Called comptime function with runtime-known values: ${args
          .filter((s) => !isKnownAtComptime(s))
          .map((s) => `'${s.value}'`)
          .join(', ')}`,
      );
    }

    ctx.pushMode(new NormalState());
    try {
      return coerceToSnippet(this[$internal].func(...(args.map((s) => s.value) as never[])));
    } finally {
      ctx.popMode();
    }
  },
} as TgpuComptime;
