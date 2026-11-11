import { d, tgpu } from 'typegpu';

/**
 * The bindings a filled 2D Perlin cache is read through. `perlin2d.cache.define` returns it as
 * `definition.layout`, and the instance's `bindGroup` is created from it.
 */
export const cacheLayout = /*#__PURE__*/ tgpu.bindGroupLayout({
  size: { uniform: d.vec2u },
  memory: { storage: /*#__PURE__*/ d.arrayOf(d.vec2f), access: 'readonly' },
});

/**
 * The size of the cache that {@link getCachedJunctionGradient} reads.
 * Defaults to the `size` entry of the cache's bind group layout.
 *
 * @category Shader
 */
export const cacheSizeAccess = /*#__PURE__*/ tgpu.accessor(d.vec2u, () => cacheLayout.$.size);

/**
 * The junction gradients that {@link getCachedJunctionGradient} reads, `size.x * size.y` of them, row by row.
 * Defaults to the `memory` entry of the cache's bind group layout.
 *
 * @category Shader
 */
export const cacheMemoryAccess = /*#__PURE__*/ tgpu.accessor(
  /*#__PURE__*/ d.arrayOf(d.vec2f),
  () => cacheLayout.$.memory,
);

/**
 * Reads the junction gradient at `pos` from a filled cache, wrapping around its size.
 * Plug it into `perlin2d.getJunctionGradientSlot` to make `perlin2d.sample` use the cache.
 *
 * @example
 * ```ts
 * const pipeline = root
 *   .with(perlin2d.getJunctionGradientSlot, perlin2d.getCachedJunctionGradient)
 *   .createRenderPipeline({ ... });
 *
 * pipeline.with(cache.bindGroup).draw(3);
 * ```
 *
 * @category Shader
 */
export const getCachedJunctionGradient = /*#__PURE__*/ tgpu.fn(
  [d.vec2i],
  d.vec2f,
)((pos) => {
  'use gpu';
  const size = d.vec2i(cacheSizeAccess.$);
  const x = ((pos.x % size.x) + size.x) % size.x;
  const y = ((pos.y % size.y) + size.y) % size.y;

  return cacheMemoryAccess.$[x + y * size.x] as d.v2f;
});
