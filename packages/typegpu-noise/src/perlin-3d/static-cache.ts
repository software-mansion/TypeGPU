import { tgpu, type Configurable, type TgpuFn, type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import { fillNow } from '../fill-now.ts';
import { getJunctionGradientSlot } from './algorithm.ts';
import { defineAndInstantiate } from './cache/index.ts';
import { cacheMemoryAccess, cacheSizeAccess, getCachedJunctionGradient } from './cache/shader.ts';

export interface StaticPerlin3DCache {
  readonly getJunctionGradient: TgpuFn<(pos: d.Vec3i) => d.Vec3f>;
  readonly size: d.v3u;
  destroy(): void;
  inject(): (cfg: Configurable) => Configurable;
}

/**
 * A statically-sized cache for perlin noise generation, which reduces the amount of redundant calculations
 * if sampling is done more than once.
 *
 * @deprecated Use `perlin3d.cache.defineAndInstantiate(root, {}, { size })`, fill it with `cache.step(pass)`,
 * plug `perlin3d.getCachedJunctionGradient` into `perlin3d.getJunctionGradientSlot` and bind `cache.bindGroup`.
 * This function fills the cache in its own submit, as soon as it's called.
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

  const cache = defineAndInstantiate(root, {}, { size });
  fillNow(root, cache);

  const getJunctionGradient = tgpu
    .fn(
      [d.vec3i],
      d.vec3f,
    )((pos) => getCachedJunctionGradient(pos))
    .with(cacheSizeAccess, cache.buffers.size.as('uniform'))
    .with(cacheMemoryAccess, cache.buffers.memory.as('readonly'));

  return {
    getJunctionGradient,
    get size() {
      return cache.size;
    },

    destroy() {
      cache.destroy();
    },

    inject: () => (cfg) => cfg.with(getJunctionGradientSlot, getJunctionGradient),
  };
}
