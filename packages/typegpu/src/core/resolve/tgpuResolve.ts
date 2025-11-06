import {
  type ResolutionResult,
  resolve as resolveImpl,
} from '../../resolutionCtx.ts';
import { $internal, $resolve } from '../../shared/symbols.ts';
import type { ShaderGenerator } from '../../tgsl/shaderGenerator.ts';
import type { SelfResolvable, Wgsl } from '../../types.ts';
import type { WgslExtension } from '../../wgslExtensions.ts';
import { isPipeline } from '../pipeline/typeGuards.ts';
import type { Configurable } from '../root/rootTypes.ts';
import { applyExternals, replaceExternalsInWgsl } from './externals.ts';
import { type Namespace, namespace } from './namespace.ts';
import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import { Void } from '../../data/wgslTypes.ts';

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
   * A custom shader code generator, used when resolving TGSL.
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

function resolveWithTemplate(
  options: TgpuExtendedResolveOptions,
): ResolutionResult {
  const {
    externals,
    shaderGenerator,
    template,
    names = 'random',
    config,
    enableExtensions,
  } = options;

  const dependencies = {} as Record<string, Wgsl>;
  applyExternals(dependencies, externals ?? {});

  const resolutionObj: SelfResolvable = {
    [$internal]: true,
    [$resolve](ctx): ResolvedSnippet {
      return snip(
        replaceExternalsInWgsl(ctx, dependencies, template ?? ''),
        Void,
      );
    },

    toString: () => '<root>',
  };

  const pipelines = Object.values(externals).filter(isPipeline);
  if (pipelines.length > 1) {
    throw new Error(
      `Found ${pipelines.length} pipelines but can only resolve one at a time.`,
    );
  }

  return resolveImpl(resolutionObj, {
    namespace: typeof names === 'string' ? namespace({ names }) : names,
    enableExtensions,
    shaderGenerator,
    config,
    root: pipelines[0]?.[$internal].branch,
  });
}

function resolveWithoutTemplate(
  items: unknown[],
  options?: TgpuResolveOptions,
): ResolutionResult {
  const {
    shaderGenerator,
    names = 'random',
    config,
    enableExtensions,
  } = options ?? {};

  const resolutionObj: SelfResolvable = {
    [$internal]: true,
    [$resolve](ctx): ResolvedSnippet {
      // biome-ignore lint/suspicious/useIterableCallbackReturn: <we just resolve>
      items.forEach((item) => ctx.resolve(item));
      return snip('', Void);
    },

    toString: () => '<root>',
  };

  const pipelines = Object.values(items).filter(isPipeline);
  if (pipelines.length > 1) {
    throw new Error(
      `Found ${pipelines.length} pipelines but can only resolve one at a time.`,
    );
  }

  return resolveImpl(resolutionObj, {
    namespace: typeof names === 'string' ? namespace({ names }) : names,
    enableExtensions,
    shaderGenerator,
    config,
    root: pipelines[0]?.[$internal].branch,
  });
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
  options: TgpuExtendedResolveOptions,
): ResolutionResult;
export function resolveWithContext(
  items: unknown[],
  options?: TgpuResolveOptions,
): ResolutionResult;
export function resolveWithContext(
  arg0: TgpuExtendedResolveOptions | unknown[],
  options?: TgpuResolveOptions,
): ResolutionResult {
  if (Array.isArray(arg0)) {
    return resolveWithoutTemplate(arg0, options);
  }
  return resolveWithTemplate(arg0);
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
export function resolve(options: TgpuExtendedResolveOptions): string;
export function resolve(
  items: unknown[],
  options?: TgpuResolveOptions,
): string;
export function resolve(
  arg: TgpuExtendedResolveOptions | unknown[],
  options?: TgpuResolveOptions,
): string {
  return resolveWithContext(arg as unknown as unknown[], options).code;
}
