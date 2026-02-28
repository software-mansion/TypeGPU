import tgpu, { type Configurable, type TgpuFn, type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import { computeJunctionGradient, getJunctionGradientSlot } from './algorithm.ts';

const MemorySchema = d.arrayOf(d.vec2f);

export interface StaticPerlin2DCache {
  readonly getJunctionGradient: TgpuFn<(pos: d.Vec2i) => d.Vec2f>;
  readonly size: d.v2u;
  destroy(): void;
  inject(): (cfg: Configurable) => Configurable;
}

/**
 * A statically-sized cache for perlin noise generation, which reduces the amount of redundant calculations
 * if sampling is done more than once. If you'd like to change the size of the cache at runtime, see `perlin2d.dynamicCacheConfig`.
 *
 * --- Basic usage
 * @example
 * ```ts
 * const mainFragment = tgpu.fragmentFn({ out: d.vec4f })(() => {
 *   const n = perlin2d.sample(d.vec2f(1.1, 2.2));
 *   // ...
 * });
 *
 * const cache = perlin2d.staticCache({ root, size: d.vec2u(10, 10) });
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
 * If the noise generator samples outside of the bounds of this cache, the space is wrapped around.
 * @example
 * ```ts
 * const cache = perlin2d.staticCache({ root, size: d.vec2u(10, 10) });
 * // ...
 * const value = perlin2d.sample(d.vec2f(0.5, 0));
 * const wrappedValue = perlin2d.sample(d.vec2f(10.5, 0)); // the same as `value`!
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
  size: d.v2u;
}): StaticPerlin2DCache {
  const { root, size } = options;

  const memoryBuffer = root.createBuffer(MemorySchema(size.x * size.y)).$usage('storage');

  const memoryReadonly = memoryBuffer.as('readonly');
  const memoryMutable = memoryBuffer.as('mutable');

  const computePipeline = root.createGuardedComputePipeline((x, y) => {
    'use gpu';
    const idx = x + y * size.x;

    memoryMutable.$[idx] = computeJunctionGradient(d.vec2i(x, y));
  });

  computePipeline.dispatchThreads(size.x, size.y);

  const getJunctionGradient = tgpu.fn(
    [d.vec2i],
    d.vec2f,
  )((pos) => {
    const size_i = d.vec2i(size);
    const x = ((pos.x % size_i.x) + size_i.x) % size_i.x;
    const y = ((pos.y % size_i.y) + size_i.y) % size_i.y;

    return memoryReadonly.$[x + y * size_i.x] as d.v2f;
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
