import tgpu, { type Configurable, type TgpuFn, type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import { computeJunctionGradient, getJunctionGradientSlot } from './algorithm.ts';

const MemorySchema = d.arrayOf(d.vec3f);

export interface StaticPerlin3DCache {
  readonly getJunctionGradient: TgpuFn<(pos: d.Vec3i) => d.Vec3f>;
  readonly size: d.v3u;
  destroy(): void;
  inject(): (cfg: Configurable) => Configurable;
}

/**
 * A statically-sized cache for perlin noise generation, which reduces the amount of redundant calculations
 * if sampling is done more than once. If you'd like to change the size of the cache at runtime, see `perlin3d.dynamicCacheConfig`.
 *
 * --- Basic usage
 * @example
 * ```ts
 * const mainFragment = tgpu.fragmentFn({ out: d.vec4f })(() => {
 *   const n = perlin3d.sample(d.vec3f(1.1, 2.2, 3.3));
 *   // ...
 * });
 *
 * const cache = perlin3d.staticCache({ root, size: d.vec3u(10, 10, 1) });
 * const pipeline = root
 *   // Plugging the cache into the pipeline
 *   .pipe(cache.inject())
 *   // ...
 *   .createRenderPipeline({
 *     // ...
 *   });
 * ```
 *
 * --- Wrapped coordinates
 *
 * If the noise generator samples outside of the bounds of this cache, the space is wrapped around.
 * @example
 * ```ts
 * const cache = perlin3d.staticCache({ root, size: d.vec3u(10, 10, 1) });
 * // ...
 * const value = perlin3d.sample(d.vec3f(0.5, 0, 0));
 * const wrappedValue = perlin3d.sample(d.vec3f(10.5, 0, 0)); // the same as `value`!
 * ```
 */
export function staticCache(options: {
  /**
   * The root to use for allocating resources.
   */
  root: TgpuRoot;
  /**
   * The size of the cache.
   */
  size: d.v3u;
}): StaticPerlin3DCache {
  const { root, size } = options;

  const memoryBuffer = root.createBuffer(MemorySchema(size.x * size.y * size.z)).$usage('storage');

  const memoryReadonly = memoryBuffer.as('readonly');
  const memoryMutable = memoryBuffer.as('mutable');

  const computePipeline = root.createGuardedComputePipeline((x, y, z) => {
    'use gpu';
    const idx = x + y * size.x + z * size.x * size.y;

    memoryMutable.$[idx] = computeJunctionGradient(d.vec3i(x, y, z));
  });

  computePipeline.dispatchThreads(size.x, size.y, size.z);

  const getJunctionGradient = tgpu.fn(
    [d.vec3i],
    d.vec3f,
  )((pos) => {
    const size_i = d.vec3i(size);
    const x = ((pos.x % size_i.x) + size_i.x) % size_i.x;
    const y = ((pos.y % size_i.y) + size_i.y) % size_i.y;
    const z = ((pos.z % size_i.z) + size_i.z) % size_i.z;

    return memoryReadonly.$[x + y * size_i.x + z * size_i.x * size_i.y] as d.v3f;
  });

  return {
    getJunctionGradient,
    get size() {
      return size;
    },

    destroy() {
      memoryBuffer.destroy();
    },

    inject: () => (cfg) => cfg.with(getJunctionGradientSlot, getJunctionGradient),
  };
}
