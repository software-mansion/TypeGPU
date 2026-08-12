import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import { Void } from '../../data/wgslTypes.ts';
import { getName } from '../../internal.ts';
import { type ResolutionResult, resolve as resolveImpl } from '../../resolutionCtx.ts';
import { $internal, $resolve, $soul } from '../../shared/symbols.ts';
import { isBindGroupLayout } from '../../tgpuBindGroupLayout.ts';
import { logger } from '../../tgpuLogger.ts';
import type { ShaderGenerator } from '../../tgsl/shaderGenerator.ts';
import { isBuffer, type ResolvableObject, type SelfResolvable, type Wgsl } from '../../types.ts';
import type { WgslEnableExtension } from '../../wgslExtensions.ts';
import { isBufferBinding } from '../buffer/bufferBinding.ts';
import { isPipeline } from '../pipeline/typeGuards.ts';
import type { Configurable, ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import { isSampler } from '../sampler/sampler.ts';
import { isTexture, isTextureView, type TgpuTextureViewSoul } from '../texture/texture.ts';
import { replaceExternalsInWgsl } from './externals.ts';
import { type Namespace, namespace } from './namespace.ts';

export interface TgpuResolveOptions {
  /**
   * The naming strategy used for generating identifiers for resolved externals and their dependencies.
   *
   * ## Namespaces
   * Each call to `tgpu.resolve` uses its own namespace by default, but a
   * custom namespace can be created with `tgpu['~unstable'].namespace` and passed in.
   *
   * This allows tracking the behavior of the resolution process, as well as
   * sharing state between calls to `tgpu.resolve`.
   *
   * @default 'strict'
   */
  names?: 'strict' | 'random' | Namespace | undefined;
  /**
   * When set to true, the resulting shaders will be stripped from all unnecessary whitespace.
   *
   * @default false
   */
  unstable_minify?: boolean;
  /**
   * A function to configure the resolution context.
   */
  config?: ((cfg: Configurable) => Configurable) | undefined;
  /**
   * List of WGSL shader extensions to enable.
   */
  enableExtensions?: WgslEnableExtension[] | undefined;
  /**
   * **NOTE: This is an unstable API and may change in the future.**
   *
   * A custom shader code generator, used when resolving TypeGPU functions.
   * If not provided, the default WGSL generator will be used.
   */
  unstable_shaderGenerator?: ShaderGenerator | undefined;
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
export function resolveWithContext(options: TgpuExtendedResolveOptions): ResolutionResult;
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
export function resolve(items: ResolvableObject[], options?: TgpuResolveOptions): string;
export function resolve(
  arg: TgpuExtendedResolveOptions | ResolvableObject[],
  options?: TgpuResolveOptions,
): string {
  if (Array.isArray(arg)) {
    return resolveWithContext(arg, options).code;
  }
  return resolveWithContext(arg).code;
}

function resolveFromTemplate(options: TgpuExtendedResolveOptions): ResolutionResult {
  const {
    template,
    externals,
    unstable_shaderGenerator: shaderGenerator,
    names = 'strict',
    unstable_minify,
    config,
    enableExtensions,
  } = options;

  if (!template) {
    logger.warn(
      'deprecated',
      "Calling resolve with an empty template is deprecated and will soon return an empty string. Consider using the 'tgpu.resolve(resolvableArray, options)' API instead.",
    );
  }

  const resolutionObj: SelfResolvable = {
    [$internal]: true,
    [$resolve](ctx): ResolvedSnippet {
      return snip(
        replaceExternalsInWgsl(ctx, externals, template ?? ''),
        Void,
        /* origin */ 'runtime',
      );
    },
    toString: () => '<root>',
  };

  const maybeRoot = tryFindRoot(Object.values(externals));

  return resolveImpl(resolutionObj, {
    namespace: typeof names === 'string' ? namespace({ names }) : names,
    minify: unstable_minify ?? maybeRoot?.minify ?? false,
    enableExtensions,
    shaderGenerator,
    config,
    root: maybeRoot,
  });
}

function resolveFromArray(
  items: ResolvableObject[],
  options?: TgpuResolveOptions,
): ResolutionResult {
  const {
    unstable_shaderGenerator: shaderGenerator,
    names = 'strict',
    unstable_minify,
    config,
    enableExtensions,
  } = options ?? {};

  const resolutionObj: SelfResolvable = {
    [$internal]: true,
    [$resolve](ctx): ResolvedSnippet {
      for (const item of items) {
        // Support for: tgpu.resolve([layout])
        if (isBindGroupLayout(item)) {
          for (const binding of Object.values(item[$internal])) {
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

  const maybeRoot = tryFindRoot(items);

  return resolveImpl(resolutionObj, {
    namespace: typeof names === 'string' ? namespace({ names }) : names,
    minify: unstable_minify ?? maybeRoot?.minify ?? false,
    enableExtensions,
    shaderGenerator,
    config,
    root: maybeRoot,
  });
}

/**
 * Attempts to locate a root in a list of items that may hold it.
 * Does not check recursively.
 * Throws an error if multiple roots are found.
 */
function tryFindRoot(items: unknown[]): ExperimentalTgpuRoot | undefined {
  const buckets: Map<ExperimentalTgpuRoot, Set<unknown>> = new Map();
  for (const item of items) {
    const root = extractRoot(item);
    if (root) {
      const bucket = buckets.get(root) ?? new Set();
      buckets.set(root, bucket);

      bucket.add(item);
    }
  }

  if (buckets.size > 1) {
    const bucketsString = [...buckets.values()]
      .map(
        (bucket, i) =>
          `root ${i + 1}: ${[...bucket].map((item) => getName(item) ?? '<unnamed>').join(', ')}`,
      )
      .join('; ');

    throw new Error(
      `Found resources originating from different roots in a single resolve (${bucketsString}).`,
    );
  }
  return [...buckets.keys()][0];
}

function extractRoot(item: unknown): ExperimentalTgpuRoot | undefined {
  if (isPipeline(item) || isBuffer(item) || isTexture(item) || isSampler(item)) {
    return item[$internal].root;
  }
  if (isBufferBinding(item)) {
    return extractRoot(item.buffer);
  }
  if (isTextureView(item)) {
    // laid out texture view should never appear here, but still passes this type guard
    return extractRoot((item as { [$soul]?: TgpuTextureViewSoul })?.[$soul]?.texture);
  }
  return undefined;
}
