import type { TgpuRoot } from 'typegpu';
import { define, type Perlin2DCacheOptions } from './define.ts';
import { instantiate, type Perlin2DCacheInstance, type Perlin2DCacheIo } from './instantiate.ts';

export { define, type Perlin2DCacheDefinition, type Perlin2DCacheOptions } from './define.ts';
export { instantiate, type Perlin2DCacheInstance, type Perlin2DCacheIo } from './instantiate.ts';

/**
 * `instantiate(root, define(root, options), io)`, for when the definition isn't precompiled.
 *
 * @example
 * ```ts
 * const cache = perlin2d.cache.defineAndInstantiate(root, {}, { size: d.vec2u(16, 16) });
 *
 * // Fill the cache once
 * const encoder = root.createCommandEncoder();
 * const pass = encoder.beginComputePass();
 * cache.step(pass);
 * pass.end();
 * encoder.submit();
 *
 * const pipeline = root
 *   .with(perlin2d.getJunctionGradientSlot, perlin2d.getCachedJunctionGradient)
 *   .createRenderPipeline({ ... });
 *
 * pipeline.with(cache.bindGroup).draw(3);
 * ```
 *
 * @category Module
 */
export function defineAndInstantiate(
  root: TgpuRoot,
  options: Perlin2DCacheOptions,
  io: Perlin2DCacheIo,
): Perlin2DCacheInstance {
  return instantiate(root, define(root, options), io);
}
