import {
  d,
  tgpu,
  type Configurable,
  type TgpuBindGroupLayout,
  type TgpuComputePipeline,
  type TgpuRoot,
} from 'typegpu';
import { computeJunctionGradient, getJunctionGradientSlot } from '../algorithm.ts';
import { cacheLayout, getCachedJunctionGradient } from './shader.ts';

const WORKGROUP_SIZE = [4, 4, 4] as const;

export type Perlin3DDynamicCacheLayoutEntries = (typeof cacheLayout)['entries'];

export type Perlin3DDynamicCacheFillLayoutEntries = {
  size: { uniform: d.Vec4u };
  memory: { storage: (count: number) => d.WgslArray<d.Vec3f>; access: 'mutable' };
};

/**
 * Nothing about the cache's shader is configurable yet.
 */
export type Perlin3DDynamicCacheOptions = Record<string, never>;

/**
 * @category Module
 */
export interface Perlin3DDynamicCacheDefinition {
  /**
   * The layout of `instance.bindGroup`. Pipelines that had the cache plugged in with `inject()` read it
   * through this layout, so bind the instance's bind group in each of them.
   */
  readonly layout: TgpuBindGroupLayout<Perlin3DDynamicCacheLayoutEntries>;
  readonly fillLayout: TgpuBindGroupLayout<Perlin3DDynamicCacheFillLayoutEntries>;
  readonly fillPipeline: TgpuComputePipeline;
  readonly workgroupSize: readonly [number, number, number];
  /**
   * Makes `perlin3d.sample` read gradients from a cache of this definition. Any instance works,
   * bind its `bindGroup` when using the pipeline.
   *
   * @example
   * ```ts
   * const pipeline = root.pipe(definition.inject()).createRenderPipeline({ ... });
   *
   * pipeline.with(cache.bindGroup).draw(3);
   * ```
   */
  inject(): (cfg: Configurable) => Configurable;
}

/**
 * Builds the pipeline that fills dynamically-sized 3D Perlin noise caches. No size is baked into
 * the shaders, sizes go to `perlin3d.dynamicCache.instantiate`.
 *
 * @category Module
 */
export function define(
  root: TgpuRoot,
  _options: Perlin3DDynamicCacheOptions = {},
): Perlin3DDynamicCacheDefinition {
  const fillLayout = tgpu.bindGroupLayout({
    size: { uniform: d.vec4u },
    memory: { storage: d.arrayOf(d.vec3f), access: 'mutable' },
  });

  const fill = tgpu.computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [...WORKGROUP_SIZE],
  })(({ gid }) => {
    'use gpu';
    const size = fillLayout.$.size;
    if (gid.x >= size.x || gid.y >= size.y || gid.z >= size.z) {
      return;
    }

    const idx = gid.x + gid.y * size.x + gid.z * size.x * size.y;
    fillLayout.$.memory[idx] = computeJunctionGradient(d.vec3i(gid));
  });

  return {
    layout: cacheLayout,
    fillLayout,
    fillPipeline: root.createComputePipeline({ compute: fill }),
    workgroupSize: WORKGROUP_SIZE,
    inject: () => (cfg) => cfg.with(getJunctionGradientSlot, getCachedJunctionGradient),
  };
}
