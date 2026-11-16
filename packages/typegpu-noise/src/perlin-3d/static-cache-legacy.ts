import { tgpu, type Configurable, type TgpuFn, type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import { fillNow } from '../fill-now.ts';
import { getJunctionGradientSlot } from './algorithm.ts';
import { defineAndInstantiate as defineAndInstantiateDynamic } from './dynamic-cache/index.ts';
import {
  cacheMemoryAccess,
  cacheSizeAccess,
  getCachedJunctionGradient,
} from './dynamic-cache/shader.ts';
import { define, defineAndInstantiate, instantiate } from './static-cache/index.ts';

export interface StaticPerlin3DCache {
  readonly getJunctionGradient: TgpuFn<(pos: d.Vec3i) => d.Vec3f>;
  readonly size: d.v3u;
  destroy(): void;
  inject(): (cfg: Configurable) => Configurable;
}

function createLegacyStaticCache(options: { root: TgpuRoot; size: d.v3u }): StaticPerlin3DCache {
  const { root, size } = options;

  const cache = defineAndInstantiateDynamic(root, {}, { size });
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

/**
 * @category Module
 */
export interface Perlin3DStaticCacheModule {
  /**
   * A statically-sized cache for perlin noise generation, which reduces the amount of redundant calculations
   * if sampling is done more than once.
   *
   * @deprecated Use `perlin3d.staticCache.defineAndInstantiate(root, { size }, {})`, fill it with `cache.step(pass)`,
   * plug it in with `cache.inject()` and bind `cache.bindGroup`. Calling `staticCache` directly fills the cache
   * in its own submit, as soon as it's called.
   */
  (options: {
    /**
     * The root to use for allocating resources.
     */
    root: TgpuRoot;
    /**
     * The size of the cache.
     */
    size: d.v3u;
  }): StaticPerlin3DCache;
  /** Builds the shaders of a statically-sized cache. The size is baked into them. */
  define: typeof define;
  /** Allocates a cache of the size its definition was made for. */
  instantiate: typeof instantiate;
  /** `instantiate(root, define(root, options), io)`, for when the definition isn't precompiled. */
  defineAndInstantiate: typeof defineAndInstantiate;
}

/**
 * A statically-sized cache of 3D Perlin noise gradients. Its size is baked into the shaders,
 * use `perlin3d.dynamicCache` to change the size without recompiling them.
 *
 * It's a function only for as long as the deprecated `staticCache({ root, size })` is around.
 *
 * @example
 * ```ts
 * const cache = perlin3d.staticCache.defineAndInstantiate(root, { size: d.vec3u(16) }, {});
 *
 * const pipeline = root.pipe(cache.inject()).createRenderPipeline({ ... });
 *
 * // Fill the cache once
 * const encoder = root.createCommandEncoder();
 * const pass = encoder.beginComputePass();
 * cache.step(pass);
 * pass.end();
 * encoder.submit();
 *
 * pipeline.with(cache.bindGroup).draw(3);
 * ```
 *
 * @category Module
 */
export const staticCache: Perlin3DStaticCacheModule = /*#__PURE__*/ Object.assign(
  createLegacyStaticCache,
  { define, instantiate, defineAndInstantiate },
);
