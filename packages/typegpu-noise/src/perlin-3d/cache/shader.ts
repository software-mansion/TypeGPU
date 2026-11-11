import { d, tgpu } from 'typegpu';

/**
 * The bindings a filled 3D Perlin cache is read through. `perlin3d.cache.define` returns it as
 * `definition.layout`, and the instance's `bindGroup` is created from it.
 *
 * The size is a `vec4u` (with `w` unused), because `vec3u` uniforms break on Safari.
 */
export const cacheLayout = /*#__PURE__*/ tgpu.bindGroupLayout({
  size: { uniform: d.vec4u },
  memory: { storage: /*#__PURE__*/ d.arrayOf(d.vec3f), access: 'readonly' },
});

/**
 * The size of the cache that {@link getCachedJunctionGradient} reads, in `xyz` (`w` is unused).
 * Defaults to the `size` entry of the cache's bind group layout.
 *
 * @category Shader
 */
export const cacheSizeAccess = /*#__PURE__*/ tgpu.accessor(d.vec4u, () => cacheLayout.$.size);

/**
 * The junction gradients that {@link getCachedJunctionGradient} reads, `size.x * size.y * size.z` of them,
 * x first, then y, then z. Defaults to the `memory` entry of the cache's bind group layout.
 *
 * @category Shader
 */
export const cacheMemoryAccess = /*#__PURE__*/ tgpu.accessor(
  /*#__PURE__*/ d.arrayOf(d.vec3f),
  () => cacheLayout.$.memory,
);

/**
 * Reads the junction gradient at `pos` from a filled cache, wrapping around its size.
 * Plug it into `perlin3d.getJunctionGradientSlot` to make `perlin3d.sample` use the cache.
 *
 * @example
 * ```ts
 * const pipeline = root
 *   .with(perlin3d.getJunctionGradientSlot, perlin3d.getCachedJunctionGradient)
 *   .createRenderPipeline({ ... });
 *
 * pipeline.with(cache.bindGroup).draw(3);
 * ```
 *
 * @category Shader
 */
export const getCachedJunctionGradient = /*#__PURE__*/ tgpu.fn(
  [d.vec3i],
  d.vec3f,
)((pos) => {
  'use gpu';
  const size = d.vec3i(cacheSizeAccess.$.xyz);
  const x = ((pos.x % size.x) + size.x) % size.x;
  const y = ((pos.y % size.y) + size.y) % size.y;
  const z = ((pos.z % size.z) + size.z) % size.z;

  return cacheMemoryAccess.$[x + y * size.x + z * size.x * size.y] as d.v3f;
});
