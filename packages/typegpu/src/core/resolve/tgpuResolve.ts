import { $internal } from '../../shared/symbols.ts';
import { RandomNameRegistry, StrictNameRegistry } from '../../nameRegistry.ts';
import {
  type ResolutionResult,
  resolve as resolveImpl,
} from '../../resolutionCtx.ts';
import type { SelfResolvable, Wgsl } from '../../types.ts';
import type { Configurable } from '../root/rootTypes.ts';
import { applyExternals, replaceExternalsInWgsl } from './externals.ts';
import type { WgslExtension } from '../../wgslExtensions.ts';
import type { ShaderGenerator } from '../../tgsl/shaderGenerator.ts';

export interface TgpuResolveOptions {
  /**
   * Map of external names to their resolvable values.
   */
  externals: Record<string, Wgsl | object>;
  /**
   * The code template to use for the resolution. All external names will be replaced with their resolved values.
   * @default ''
   */
  template?: string | undefined;
  /**
   * The naming strategy used for generating identifiers for resolved externals and their dependencies.
   * @default 'random'
   */
  names?: 'strict' | 'random' | undefined;
  /**
   * A function to configure the resolution context.
   */
  config?: ((cfg: Configurable) => Configurable) | undefined;
  /**
   * List of WGSL shader extensions to enable.
   */
  enableExtensions?: WgslExtension[] | undefined;
  /**
   * A custom shader code generator, used when resolving TGSL.
   * If not provided, the default WGSL generator will be used.
   */
  shaderGenerator?: ShaderGenerator | undefined;
}

/**
 * Resolves a template with external values. Each external will get resolved to a code string and replaced in the template.
 * Any dependencies of the externals will also be resolved and included in the output.
 * @param options - The options for the resolution.
 *
 * @returns {ResolutionResult}
 *
 * @example
 * ```ts
 * const Gradient = d.struct({
 *   from: d.vec3f,
 *   to: d.vec3f,
 * });
 *
 * const { code, usedBindGroupLayouts, catchall } = tgpu.resolveWithContext({
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
 * console.log(code);
 * // struct Gradient_0 {
 * //   from: vec3f,
 * //   to: vec3f,
 * // }
 * // fn getGradientAngle(gradient: Gradient_0) -> f32 {
 * //   return atan(gradient.to.y - gradient.from.y, gradient.to.x - gradient.from.x);
 * // }
 * ```
 */
export function resolveWithContext(
  options: TgpuResolveOptions,
): ResolutionResult {
  const {
    externals,
    shaderGenerator,
    template,
    names,
    config,
    enableExtensions,
  } = options;

  const dependencies = {} as Record<string, Wgsl>;
  applyExternals(dependencies, externals ?? {});

  const resolutionObj: SelfResolvable = {
    [$internal]: true,
    '~resolve'(ctx) {
      return replaceExternalsInWgsl(ctx, dependencies, template ?? '');
    },

    toString: () => '<root>',
  };

  return resolveImpl(
    resolutionObj,
    {
      names: names === 'strict'
        ? new StrictNameRegistry()
        : new RandomNameRegistry(),
      enableExtensions,
      shaderGenerator,
    },
    config,
  );
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
 *   from: d.vec3f,
 *   to: d.vec3f,
 * });
 *
 * const resolved = tgpu.resolve({
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
  return resolveWithContext(options).code;
}
