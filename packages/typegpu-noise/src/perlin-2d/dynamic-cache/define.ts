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

const WORKGROUP_SIZE = [8, 8] as const;

export type Perlin2DDynamicCacheLayoutEntries = (typeof cacheLayout)['entries'];

export type Perlin2DDynamicCacheFillLayoutEntries = {
  size: { uniform: d.Vec2u };
  memory: { storage: (count: number) => d.WgslArray<d.Vec2f>; access: 'mutable' };
};

/**
 * Nothing about the cache's shader is configurable yet.
 */
export type Perlin2DDynamicCacheOptions = Record<string, never>;

/**
 * @category Module
 */
export interface Perlin2DDynamicCacheDefinition {
  /**
   * The layout of `instance.bindGroup`. Pipelines that had the cache plugged in with `inject()` read it
   * through this layout, so bind the instance's bind group in each of them.
   */
  readonly layout: TgpuBindGroupLayout<Perlin2DDynamicCacheLayoutEntries>;
  readonly fillLayout: TgpuBindGroupLayout<Perlin2DDynamicCacheFillLayoutEntries>;
  readonly fillPipeline: TgpuComputePipeline;
  readonly workgroupSize: readonly [number, number];
  /**
   * Makes `perlin2d.sample` read gradients from a cache of this definition. Any instance works,
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
 * Builds the pipeline that fills dynamically-sized 2D Perlin noise caches. No size is baked into
 * the shaders, sizes go to `perlin2d.dynamicCache.instantiate`.
 *
 * @category Module
 */
export function define(
  root: TgpuRoot,
  _options: Perlin2DDynamicCacheOptions = {},
): Perlin2DDynamicCacheDefinition {
  const fillLayout = tgpu.bindGroupLayout({
    size: { uniform: d.vec2u },
    memory: { storage: d.arrayOf(d.vec2f), access: 'mutable' },
  });

  const fill = tgpu.computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [...WORKGROUP_SIZE],
  })(({ gid }) => {
    'use gpu';
    const size = fillLayout.$.size;
    if (gid.x >= size.x || gid.y >= size.y) {
      return;
    }

    fillLayout.$.memory[gid.x + gid.y * size.x] = computeJunctionGradient(d.vec2i(gid.xy));
  });

  return {
    layout: cacheLayout,
    fillLayout,
    fillPipeline: root.createComputePipeline({ compute: fill }),
    workgroupSize: WORKGROUP_SIZE,
    inject: () => (cfg) => cfg.with(getJunctionGradientSlot, getCachedJunctionGradient),
  };
}
