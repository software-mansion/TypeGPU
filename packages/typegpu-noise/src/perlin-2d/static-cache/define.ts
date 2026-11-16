import {
  d,
  tgpu,
  type Configurable,
  type TgpuBindGroupLayout,
  type TgpuComputePipeline,
  type TgpuRoot,
} from 'typegpu';
import { computeJunctionGradient, getJunctionGradientSlot } from '../algorithm.ts';

const MODULE = 'perlin2d.staticCache';
const WORKGROUP_SIZE = [8, 8] as const;

export type Perlin2DStaticCacheLayoutEntries = {
  memory: { storage: d.WgslArray<d.Vec2f>; access: 'readonly' };
};

export type Perlin2DStaticCacheFillLayoutEntries = {
  memory: { storage: d.WgslArray<d.Vec2f>; access: 'mutable' };
};

/**
 * @category Module
 */
export interface Perlin2DStaticCacheOptions {
  /**
   * How many junctions the cache holds along each axis. Sampling outside of it wraps around.
   * It's baked into the shaders, use `perlin2d.dynamicCache` to change it without recompiling them.
   */
  size: d.v2u;
}

/**
 * @category Module
 */
export interface Perlin2DStaticCacheDefinition {
  readonly size: d.v2u;
  /**
   * The layout of `instance.bindGroup`. Pipelines that had the cache plugged in with `inject()` read it
   * through this layout, so bind the instance's bind group in each of them.
   */
  readonly layout: TgpuBindGroupLayout<Perlin2DStaticCacheLayoutEntries>;
  readonly fillLayout: TgpuBindGroupLayout<Perlin2DStaticCacheFillLayoutEntries>;
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

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Builds the shaders of a statically-sized 2D Perlin noise cache. The size is baked into them,
 * which makes sampling a bit cheaper than with `perlin2d.dynamicCache`.
 *
 * @category Module
 */
export function define(
  root: TgpuRoot,
  options: Perlin2DStaticCacheOptions,
): Perlin2DStaticCacheDefinition {
  const size = options.size.xy;
  if (!isPositiveInteger(size.x) || !isPositiveInteger(size.y)) {
    throw new Error(
      `${MODULE}: size has to be made of positive integers, got (${size.x}, ${size.y})`,
    );
  }

  const Memory = d.arrayOf(d.vec2f, size.x * size.y);
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
    if (gid.x >= size.x || gid.y >= size.y) {
      return;
    }

    fillLayout.$.memory[gid.x + gid.y * size.x] = computeJunctionGradient(d.vec2i(gid.xy));
  });

  const getJunctionGradient = tgpu.fn(
    [d.vec2i],
    d.vec2f,
  )((pos) => {
    'use gpu';
    const size_i = d.vec2i(size);
    const x = ((pos.x % size_i.x) + size_i.x) % size_i.x;
    const y = ((pos.y % size_i.y) + size_i.y) % size_i.y;

    return layout.$.memory[x + y * size_i.x] as d.v2f;
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
