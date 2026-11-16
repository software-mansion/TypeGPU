import type { TgpuRoot } from 'typegpu';
import { define, type Perlin2DStaticCacheOptions } from './define.ts';
import {
  instantiate,
  type Perlin2DStaticCacheInstance,
  type Perlin2DStaticCacheIo,
} from './instantiate.ts';

export {
  define,
  type Perlin2DStaticCacheDefinition,
  type Perlin2DStaticCacheOptions,
} from './define.ts';
export {
  instantiate,
  type Perlin2DStaticCacheInstance,
  type Perlin2DStaticCacheIo,
} from './instantiate.ts';

/**
 * `instantiate(root, define(root, options), io)`, for when the definition isn't precompiled.
 *
 * @example
 * ```ts
 * const cache = perlin2d.staticCache.defineAndInstantiate(root, { size: d.vec2u(16, 16) }, {});
 *
 * // Fill the cache once
 * const encoder = root.createCommandEncoder();
 * const pass = encoder.beginComputePass();
 * cache.step(pass);
 * pass.end();
 * encoder.submit();
 *
 * const pipeline = root.pipe(cache.inject()).createRenderPipeline({ ... });
 *
 * pipeline.with(cache.bindGroup).draw(3);
 * ```
 *
 * @category Module
 */
export function defineAndInstantiate(
  root: TgpuRoot,
  options: Perlin2DStaticCacheOptions,
  io: Perlin2DStaticCacheIo = {},
): Perlin2DStaticCacheInstance {
  return instantiate(root, define(root, options), io);
}
