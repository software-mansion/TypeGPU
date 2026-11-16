import type { TgpuRoot } from 'typegpu';
import { define, type Perlin3DStaticCacheOptions } from './define.ts';
import {
  instantiate,
  type Perlin3DStaticCacheInstance,
  type Perlin3DStaticCacheIo,
} from './instantiate.ts';

export {
  define,
  type Perlin3DStaticCacheDefinition,
  type Perlin3DStaticCacheOptions,
} from './define.ts';
export {
  instantiate,
  type Perlin3DStaticCacheInstance,
  type Perlin3DStaticCacheIo,
} from './instantiate.ts';

/**
 * `instantiate(root, define(root, options), io)`, for when the definition isn't precompiled.
 *
 * @example
 * ```ts
 * const cache = perlin3d.staticCache.defineAndInstantiate(root, { size: d.vec3u(16, 16, 16) }, {});
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
  options: Perlin3DStaticCacheOptions,
  io: Perlin3DStaticCacheIo = {},
): Perlin3DStaticCacheInstance {
  return instantiate(root, define(root, options), io);
}
