import {
  d,
  tgpu,
  type TgpuBindGroupLayout,
  type TgpuComputePipeline,
  type TgpuRoot,
} from 'typegpu';
import { computeJunctionGradient } from '../algorithm.ts';
import { cacheLayout } from './shader.ts';

const WORKGROUP_SIZE = [4, 4, 4] as const;

export type Perlin3DCacheLayoutEntries = (typeof cacheLayout)['entries'];

export type Perlin3DCacheFillLayoutEntries = {
  size: { uniform: d.Vec4u };
  memory: { storage: (count: number) => d.WgslArray<d.Vec3f>; access: 'mutable' };
};

/**
 * Nothing about the cache's shader is configurable yet.
 */
export type Perlin3DCacheOptions = Record<string, never>;

/**
 * @category Module
 */
export interface Perlin3DCacheDefinition {
  /**
   * The layout of `instance.bindGroup`. `perlin3d.getCachedJunctionGradient` reads the cache through it
   * (via `perlin3d.cacheSizeAccess` and `perlin3d.cacheMemoryAccess`), so bind the instance's bind group in
   * every pipeline that uses it.
   */
  readonly layout: TgpuBindGroupLayout<Perlin3DCacheLayoutEntries>;
  readonly fillLayout: TgpuBindGroupLayout<Perlin3DCacheFillLayoutEntries>;
  readonly fillPipeline: TgpuComputePipeline;
  readonly workgroupSize: readonly [number, number, number];
}

/**
 * Builds the pipeline that fills 3D Perlin noise caches. Sizes go to `perlin3d.cache.instantiate`.
 *
 * @category Module
 */
export function define(
  root: TgpuRoot,
  _options: Perlin3DCacheOptions = {},
): Perlin3DCacheDefinition {
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
  };
}
