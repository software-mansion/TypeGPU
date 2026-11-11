import type { TgpuRoot } from 'typegpu';
import { define, type Perlin3DCacheOptions } from './define.ts';
import { instantiate, type Perlin3DCacheInstance, type Perlin3DCacheIo } from './instantiate.ts';

export { define, type Perlin3DCacheDefinition, type Perlin3DCacheOptions } from './define.ts';
export { instantiate, type Perlin3DCacheInstance, type Perlin3DCacheIo } from './instantiate.ts';

/**
 * `instantiate(root, define(root, options), io)`, for when the definition isn't precompiled.
 *
 * @example
 * ```ts
 * const cache = perlin3d.cache.defineAndInstantiate(root, {}, { size: d.vec3u(16, 16, 16) });
 *
 * // Fill the cache once
 * const encoder = root.createCommandEncoder();
 * const pass = encoder.beginComputePass();
 * cache.step(pass);
 * pass.end();
 * encoder.submit();
 *
 * const pipeline = root
 *   .with(perlin3d.getJunctionGradientSlot, perlin3d.getCachedJunctionGradient)
 *   .createRenderPipeline({ ... });
 *
 * pipeline.with(cache.bindGroup).draw(3);
 * ```
 *
 * @category Module
 */
export function defineAndInstantiate(
  root: TgpuRoot,
  options: Perlin3DCacheOptions,
  io: Perlin3DCacheIo,
): Perlin3DCacheInstance {
  return instantiate(root, define(root, options), io);
}
