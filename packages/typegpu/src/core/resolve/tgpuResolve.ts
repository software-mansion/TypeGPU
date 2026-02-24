import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import { Void } from '../../data/wgslTypes.ts';
import {
  type ResolutionResult,
  resolve as resolveImpl,
} from '../../resolutionCtx.ts';
import { $internal, $resolve } from '../../shared/symbols.ts';
import { isBindGroupLayout } from '../../tgpuBindGroupLayout.ts';
import type { ShaderGenerator } from '../../tgsl/shaderGenerator.ts';
import type { ResolvableObject, SelfResolvable, Wgsl } from '../../types.ts';
import type { WgslExtension } from '../../wgslExtensions.ts';
import { isPipeline } from '../pipeline/typeGuards.ts';
import type { Configurable, ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import { applyExternals, replaceExternalsInWgsl } from './externals.ts';
import { type Namespace, namespace } from './namespace.ts';

export interface TgpuResolveOptions {
  /**
   * The naming strategy used for generating identifiers for resolved externals and their dependencies.
   *
   * ## Namespaces
   * Each call to `tgpu.resolve` uses it's own namespace by default, but a
   * custom namespace can be created with `tgpu.namespace` and passed in.
   *
   * This allows tracking the behavior of the resolution process, as well as
   * sharing state between calls to `tgpu.resolve`.
   *
   * @default 'random'
   */
  names?: 'strict' | 'random' | Namespace | undefined;
  /**
   * A function to configure the resolution context.
   */
  config?: ((cfg: Configurable) => Configurable) | undefined;
  /**
   * List of WGSL shader extensions to enable.
   */
  enableExtensions?: WgslExtension[] | undefined;
  /**
   * A custom shader code generator, used when resolving TypeGPU functions.
   * If not provided, the default WGSL generator will be used.
   */
  shaderGenerator?: ShaderGenerator | undefined;
}

export interface TgpuExtendedResolveOptions extends TgpuResolveOptions {
  /**
   * Map of external names to their resolvable values.
   */
  externals: Record<string, Wgsl | object>;
  /**
   * The code template to use for the resolution. All external names will be replaced with their resolved values.
   * @default ''
   */
  template?: string | undefined;
}

/**
 * Resolves a template with external values. Each external that is used will get resolved to a code string and replaced in the template.
 * Any dependencies of the externals will also be resolved and included in the output.
 * @param options - The options for the resolution.
 *
 * @returns {ResolutionResult}
 *
 * @example
 * ```ts
 * const Gradient = d.struct({ from: d.vec3f, to: d.vec3f });
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
  options: TgpuExtendedResolveOptions,
): ResolutionResult;
/**
 * Resolves given TypeGPU resources.
 * Any dependencies of the externals will also be resolved and included in the output.
 * @param items - An array of items to resolve.
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
 * const { code, usedBindGroupLayouts, catchall } =
 *   tgpu.resolveWithContext([Gradient]);
 *
 * console.log(code);
 * // struct Gradient_0 {
 * //   from: vec3f,
 * //   to: vec3f,
 * // }
 * ```
 */
export function resolveWithContext(
  items: ResolvableObject[],
  options?: TgpuResolveOptions,
): ResolutionResult;
export function resolveWithContext(
  arg0: TgpuExtendedResolveOptions | ResolvableObject[],
  options?: TgpuResolveOptions,
): ResolutionResult {
  if (Array.isArray(arg0)) {
    return resolveFromArray(arg0, options);
  }
  return resolveFromTemplate(arg0);
}

/**
 * A shorthand for calling `tgpu.resolveWithContext(...).code`.
 *
 * @example
 * ```ts
 * const Gradient = d.struct({ from: d.vec3f, to: d.vec3f });
 *
 * const resolved = tgpu.resolve([Gradient]);
 *
 * console.log(resolved);
 * // struct Gradient_0 {
 * //   from: vec3f,
 * //   to: vec3f,
 * // }
 * ```
 *
 * @example
 * ```ts
 * const Gradient = d.struct({ from: d.vec3f, to: d.vec3f });
 *
 * const code = tgpu.resolve({
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
export function resolve(options: TgpuExtendedResolveOptions): string;
export function resolve(
  items: ResolvableObject[],
  options?: TgpuResolveOptions,
): string;
export function resolve(
  arg: TgpuExtendedResolveOptions | ResolvableObject[],
  options?: TgpuResolveOptions,
): string {
  if (Array.isArray(arg)) {
    return resolveWithContext(arg, options).code;
  }
  return resolveWithContext(arg).code;
}

function resolveFromTemplate(
  options: TgpuExtendedResolveOptions,
): ResolutionResult {
  const {
    template,
    externals,
    shaderGenerator,
    names = 'strict',
    config,
    enableExtensions,
  } = options;

  if (!template) {
    console.warn(
      "Calling resolve with an empty template is deprecated and will soon return an empty string. Consider using the 'tgpu.resolve(resolvableArray, options)' API instead.",
    );
  }

  const dependencies = {} as Record<string, Wgsl>;
  applyExternals(dependencies, externals ?? {});

  const resolutionObj: SelfResolvable = {
    [$internal]: true,
    [$resolve](ctx): ResolvedSnippet {
      return snip(
        replaceExternalsInWgsl(ctx, dependencies, template ?? ''),
        Void,
        /* origin */ 'runtime',
      );
    },
    toString: () => '<root>',
  };

  return resolveImpl(resolutionObj, {
    namespace: typeof names === 'string' ? namespace({ names }) : names,
    enableExtensions,
    shaderGenerator,
    config,
    root: tryFindRoot(Object.values(externals)),
  });
}

function resolveFromArray(
  items: ResolvableObject[],
  options?: TgpuResolveOptions,
): ResolutionResult {
  const {
    shaderGenerator,
    names = 'strict',
    config,
    enableExtensions,
  } = options ?? {};

  const resolutionObj: SelfResolvable = {
    [$internal]: true,
    [$resolve](ctx): ResolvedSnippet {
      for (const item of items) {
        // Support for: tgpu.resolve([layout])
        if (isBindGroupLayout(item)) {
          for (const binding of Object.values(item[$internal].bound)) {
            ctx.resolve(binding);
          }
        } else {
          ctx.resolve(item);
        }
      }
      return snip('', Void, 'runtime');
    },
    toString: () => '<root>',
  };

  return resolveImpl(resolutionObj, {
    namespace: typeof names === 'string' ? namespace({ names }) : names,
    enableExtensions,
    shaderGenerator,
    config,
    root: tryFindRoot(items),
  });
}

/**
 * Attempts to locate a pipeline in a list of items and returns the root.
 * Does not check recursively.
 * Throws an error if multiple pipelines are found.
 */
function tryFindRoot(items: unknown[]): ExperimentalTgpuRoot | undefined {
  const pipelines = items.filter(isPipeline);
  if (pipelines.length > 1) {
    throw new Error(
      `Found ${pipelines.length} pipelines but can only resolve one at a time.`,
    );
  }
  return pipelines[0]?.[$internal].root;
}
