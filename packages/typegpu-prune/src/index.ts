import { tgpu, type TgpuRoot } from 'typegpu';

export interface PrecompileOptions {
  /**
   * GPU features the build-time root reports as enabled. Shaders get an `enable` directive
   * for each of them, so precompile one variant per feature set and pick one at runtime.
   * Has no effect when the arrow runs at runtime, where the device's own features apply.
   * @default []
   */
  features?: GPUFeatureName[] | undefined;
}

/**
 * A factory returned by `precompile()`. Call it with a root to get the result of the arrow,
 * attached to that root. Calling it again with the same root returns the same result.
 */
export type PrecompiledFactory<TResult> = (root: TgpuRoot) => TResult;

/**
 * Marks TypeGPU code to be compiled at build time.
 *
 * With the `@typegpu/prune` build plugin in a precompiling build, the arrow is evaluated
 * at build time and the call is replaced with WGSL, layouts and generated buffer codecs,
 * so that TypeGPU never reaches the bundle. Without the plugin (e.g. in dev), the arrow
 * runs at runtime on full TypeGPU.
 *
 * The arrow may use imports and module-level constants with literal values. Schemas,
 * layouts and shader functions have to be created inside of it, or imported. It receives
 * nothing known only at runtime, so settings that differ between devices are precompiled
 * as variants, and picked from at runtime. Render pipeline targets without a format use the
 * preferred canvas format at runtime, as they do in TypeGPU.
 *
 * @example
 * ```ts
 * const boids = precompile((root) => {
 *   const params = root.createUniform(Params);
 *   const render = root.createRenderPipeline({ vertex, fragment });
 *   return { params, render };
 * });
 *
 * const root = await init();
 * const gpu = boids(root);
 * ```
 */
export function precompile<TResult>(
  fn: (root: TgpuRoot) => TResult,
  _options?: PrecompileOptions,
): PrecompiledFactory<TResult> {
  const results = new WeakMap<TgpuRoot, TResult>();

  return (root) => {
    let result = results.get(root);
    if (result === undefined) {
      result = fn(root);
      results.set(root, result);
    }
    return result;
  };
}

/** Requests a device and creates a root. Same as `tgpu.init()`, swapped for the pruned runtime in precompiled builds. */
export const init: typeof tgpu.init = (options) => tgpu.init(options);

/** Creates a root around an existing device. Same as `tgpu.initFromDevice()`, swapped for the pruned runtime in precompiled builds. */
export const initFromDevice: typeof tgpu.initFromDevice = (options) => tgpu.initFromDevice(options);
