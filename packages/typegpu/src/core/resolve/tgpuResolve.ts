import type { AnyWgslData } from '../../data/wgslTypes';
import type { JitTranspiler } from '../../jitTranspiler';
import { RandomNameRegistry, StrictNameRegistry } from '../../nameRegistry';
import { resolve as resolveImpl } from '../../resolutionCtx';
import type { TgpuResolvable } from '../../types';
import { applyExternals, replaceExternalsInWgsl } from './externals';

export interface TgpuResolveOptions {
  /**
   * Map of external names to their resolvable values.
   */
  externals: Record<string, TgpuResolvable | AnyWgslData | string | number>;
  /**
   * The code template to use for the resolution. All external names will be replaced with their resolved values.
   */
  template?: string | undefined;
  /**
   * The naming strategy used for generating identifiers for resolved externals and their dependencies.
   * @default 'random'
   */
  names?: 'strict' | 'random' | undefined;
  /**
   * Optional JIT transpiler for resolving TGSL functions.
   */
  jitTranspiler?: JitTranspiler | undefined;
}

/**
 * Resolves a template with external values. Each external will get resolved to a code string and replaced in the template.
 * Any dependencies of the externals will also be resolved and included in the output.
 * @param options - The options for the resolution.
 *
 * @returns The resolved code.
 *
 * @example
 * ```ts
 * const Gradient = d.struct({
 *   from: d.vec2,
 *   to: d.vec2,
 * });
 *
 * const resolved = resolve({
 *   template: `
 *     fn getGradientAngle(gradient: Gradient) -> f32 {
 *       return atan(gradient.to.y - gradient.from.y, gradient.to.x - gradient.from.x);
 *     }
 *   `,
 *   externals: {
 *     Gradient,
 *   },
 * });
 *
 * console.log(resolved);
 * // struct Gradient_0 {
 * //   from: vec3f,
 * //   to: vec3f,
 * // }
 * // fn getGradientAngle(gradient: Gradient_0) -> f32 {
 * //   return atan(gradient.to.y - gradient.from.y, gradient.to.x - gradient.from.x);
 * // }
 * ```
 */
export function resolve(options: TgpuResolveOptions): string {
  const { externals, template, names, jitTranspiler } = options;

  const dependencies = {} as Record<string, TgpuResolvable>;
  applyExternals(dependencies, externals ?? {});

  const resolutionObj: TgpuResolvable = {
    resolve(ctx) {
      return replaceExternalsInWgsl(ctx, dependencies, template ?? '');
    },
  };

  Object.defineProperty(resolutionObj, 'toString', {
    value: () => '<root>',
  });

  const { code } = resolveImpl(resolutionObj, {
    names:
      names === 'strict' ? new StrictNameRegistry() : new RandomNameRegistry(),
    jitTranspiler: jitTranspiler,
  });

  return code;
}
