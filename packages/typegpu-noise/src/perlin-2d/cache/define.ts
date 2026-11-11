import {
  d,
  tgpu,
  type TgpuBindGroupLayout,
  type TgpuComputePipeline,
  type TgpuRoot,
} from 'typegpu';
import { computeJunctionGradient } from '../algorithm.ts';
import { cacheLayout } from './shader.ts';

const WORKGROUP_SIZE = [8, 8] as const;

export type Perlin2DCacheLayoutEntries = (typeof cacheLayout)['entries'];

export type Perlin2DCacheFillLayoutEntries = {
  size: { uniform: d.Vec2u };
  memory: { storage: (count: number) => d.WgslArray<d.Vec2f>; access: 'mutable' };
};

/**
 * Nothing about the cache's shader is configurable yet.
 */
export type Perlin2DCacheOptions = Record<string, never>;

/**
 * @category Module
 */
export interface Perlin2DCacheDefinition {
  /**
   * The layout of `instance.bindGroup`. `perlin2d.getCachedJunctionGradient` reads the cache through it
   * (via `perlin2d.cacheSizeAccess` and `perlin2d.cacheMemoryAccess`), so bind the instance's bind group in
   * every pipeline that uses it.
   */
  readonly layout: TgpuBindGroupLayout<Perlin2DCacheLayoutEntries>;
  readonly fillLayout: TgpuBindGroupLayout<Perlin2DCacheFillLayoutEntries>;
  readonly fillPipeline: TgpuComputePipeline;
  readonly workgroupSize: readonly [number, number];
}

/**
 * Builds the pipeline that fills 2D Perlin noise caches. Sizes go to `perlin2d.cache.instantiate`.
 *
 * @category Module
 */
export function define(
  root: TgpuRoot,
  _options: Perlin2DCacheOptions = {},
): Perlin2DCacheDefinition {
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
  };
}
