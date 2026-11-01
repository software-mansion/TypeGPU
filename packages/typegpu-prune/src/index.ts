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

type HolesArg<THoles> = [THoles] extends [undefined] ? [holes?: undefined] : [holes: THoles];

/**
 * A factory returned by `precompile()`. Call it with a root (and the runtime values,
 * if the arrow declared any) to get the result of the arrow, attached to that root.
 */
export type PrecompiledFactory<TResult, THoles> = (
  root: TgpuRoot,
  ...holes: HolesArg<THoles>
) => TResult;

/**
 * Marks TypeGPU code to be compiled at build time.
 *
 * With the `@typegpu/prune` build plugin in a precompiling build, the arrow is evaluated
 * at build time and the call is replaced with WGSL, layouts and generated buffer codecs,
 * so that TypeGPU never reaches the bundle. Without the plugin (e.g. in dev), the arrow
 * runs at runtime on full TypeGPU.
 *
 * The arrow may use imports and module-level constants with literal values. Schemas,
 * layouts and shader functions have to be created inside of it, or imported.
 *
 * @param fn Receives a root, and an object of values only known at runtime ("holes").
 *   Holes can only flow into settings that don't change the generated WGSL,
 *   like render target formats.
 *
 * @example
 * ```ts
 * const boids = precompile((root, rt: { format: GPUTextureFormat }) => {
 *   const params = root.createUniform(Params);
 *   return { params, render: root.createRenderPipeline({ ..., targets: { format: rt.format } }) };
 * });
 *
 * const root = await init();
 * const gpu = boids(root, { format: navigator.gpu.getPreferredCanvasFormat() });
 * ```
 */
export function precompile<TResult, THoles = undefined>(
  fn: (root: TgpuRoot, holes: THoles) => TResult,
  _options?: PrecompileOptions,
): PrecompiledFactory<TResult, THoles> {
  const results = new WeakMap<TgpuRoot, Map<string, TResult>>();

  return (root, ...[holes]) => {
    let perRoot = results.get(root);
    if (!perRoot) {
      perRoot = new Map();
      results.set(root, perRoot);
    }
    const key = JSON.stringify(holes ?? {});
    let result = perRoot.get(key);
    if (result === undefined) {
      result = fn(root, (holes ?? {}) as THoles);
      perRoot.set(key, result);
    }
    return result;
  };
}

/** Requests a device and creates a root. Same as `tgpu.init()`, swapped for the pruned runtime in precompiled builds. */
export const init: typeof tgpu.init = (options) => tgpu.init(options);

/** Creates a root around an existing device. Same as `tgpu.initFromDevice()`, swapped for the pruned runtime in precompiled builds. */
export const initFromDevice: typeof tgpu.initFromDevice = (options) => tgpu.initFromDevice(options);
