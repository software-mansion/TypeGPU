import {
  d,
  tgpu,
  type Configurable,
  type TgpuBindGroupLayout,
  type TgpuComputePipeline,
  type TgpuRoot,
} from 'typegpu';
import { computeJunctionGradient, getJunctionGradientSlot } from '../algorithm.ts';

const MODULE = 'perlin3d.staticCache';
const WORKGROUP_SIZE = [4, 4, 4] as const;

export type Perlin3DStaticCacheLayoutEntries = {
  memory: { storage: d.WgslArray<d.Vec3f>; access: 'readonly' };
};

export type Perlin3DStaticCacheFillLayoutEntries = {
  memory: { storage: d.WgslArray<d.Vec3f>; access: 'mutable' };
};

/**
 * @category Module
 */
export interface Perlin3DStaticCacheOptions {
  /**
   * How many junctions the cache holds along each axis. Sampling outside of it wraps around.
   * It's baked into the shaders, use `perlin3d.dynamicCache` to change it without recompiling them.
   */
  size: d.v3u;
}

/**
 * @category Module
 */
export interface Perlin3DStaticCacheDefinition {
  readonly size: d.v3u;
  /**
   * The layout of `instance.bindGroup`. Pipelines that had the cache plugged in with `inject()` read it
   * through this layout, so bind the instance's bind group in each of them.
   */
  readonly layout: TgpuBindGroupLayout<Perlin3DStaticCacheLayoutEntries>;
  readonly fillLayout: TgpuBindGroupLayout<Perlin3DStaticCacheFillLayoutEntries>;
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

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Builds the shaders of a statically-sized 3D Perlin noise cache. The size is baked into them,
 * which makes sampling a bit cheaper than with `perlin3d.dynamicCache`.
 *
 * @category Module
 */
export function define(
  root: TgpuRoot,
  options: Perlin3DStaticCacheOptions,
): Perlin3DStaticCacheDefinition {
  const size = options.size.xyz;
  if (!isPositiveInteger(size.x) || !isPositiveInteger(size.y) || !isPositiveInteger(size.z)) {
    throw new Error(
      `${MODULE}: size has to be made of positive integers, got (${size.x}, ${size.y}, ${size.z})`,
    );
  }

  const Memory = d.arrayOf(d.vec3f, size.x * size.y * size.z);
  const layout = tgpu.bindGroupLayout({
    memory: { storage: Memory, access: 'readonly' },
  });
  const fillLayout = tgpu.bindGroupLayout({
    memory: { storage: Memory, access: 'mutable' },
  });

  const fill = tgpu.computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [...WORKGROUP_SIZE],
  })(({ gid }) => {
    'use gpu';
    if (gid.x >= size.x || gid.y >= size.y || gid.z >= size.z) {
      return;
    }

    const idx = gid.x + gid.y * size.x + gid.z * size.x * size.y;
    fillLayout.$.memory[idx] = computeJunctionGradient(d.vec3i(gid));
  });

  const getJunctionGradient = tgpu.fn(
    [d.vec3i],
    d.vec3f,
  )((pos) => {
    'use gpu';
    const size_i = d.vec3i(size);
    const x = ((pos.x % size_i.x) + size_i.x) % size_i.x;
    const y = ((pos.y % size_i.y) + size_i.y) % size_i.y;
    const z = ((pos.z % size_i.z) + size_i.z) % size_i.z;

    return layout.$.memory[x + y * size_i.x + z * size_i.x * size_i.y] as d.v3f;
  });

  return {
    size,
    layout,
    fillLayout,
    fillPipeline: root.createComputePipeline({ compute: fill }),
    workgroupSize: WORKGROUP_SIZE,
    inject: () => (cfg) => cfg.with(getJunctionGradientSlot, getJunctionGradient),
  };
}
