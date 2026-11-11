import {
  type Configurable,
  type StorageFlag,
  type TgpuAccessor,
  type TgpuBuffer,
  type TgpuFn,
  type TgpuRoot,
  type UniformFlag,
} from 'typegpu';
import * as d from 'typegpu/data';
import { allEq } from 'typegpu/std';
import type { PrefixKeys, Prettify } from '../utils.ts';
import { fillNow } from '../fill-now.ts';
import { getJunctionGradientSlot } from './algorithm.ts';
import { define } from './cache/define.ts';
import { instantiate } from './cache/instantiate.ts';
import { cacheMemoryAccess, cacheSizeAccess, getCachedJunctionGradient } from './cache/shader.ts';

const MemorySchema = d.arrayOf(d.vec3f);

type Layout<Prefix extends string> = Prettify<
  PrefixKeys<
    Prefix,
    {
      readonly size: { uniform: d.Vec4u };
      readonly memory: {
        storage: typeof MemorySchema;
        access: 'readonly';
      };
    }
  >
>;

type SizeIn = TgpuAccessor.In<d.Vec4u>;
type MemoryIn = TgpuAccessor.In<typeof MemorySchema>;

type LayoutValue<Prefix extends string> = Prettify<
  PrefixKeys<
    Prefix,
    {
      readonly size: SizeIn;
      readonly memory: MemoryIn;
    }
  >
>;

type Bindings<Prefix extends string> = Prettify<
  PrefixKeys<
    Prefix,
    {
      size: TgpuBuffer<d.Vec4u> & UniformFlag;
      memory: TgpuBuffer<d.WgslArray<d.Vec3f>> & StorageFlag;
    }
  >
>;

export interface DynamicPerlin3DCacheConfig<Prefix extends string> {
  readonly layout: Layout<Prefix>;
  readonly getJunctionGradient: TgpuFn<(pos: d.Vec3i) => d.Vec3f>;

  instance(root: TgpuRoot, initialSize: d.v3u): DynamicPerlin3DCache<Prefix>;

  inject(layoutValue: LayoutValue<Prefix>): (cfg: Configurable) => Configurable;
}

export interface DynamicPerlin3DCache<Prefix extends string> {
  size: d.v3u;
  readonly bindings: Bindings<Prefix>;

  destroy(): void;
}

const DefaultPerlin3DLayoutPrefix = 'perlin3dCache__' as const;

/**
 * Used to instantiate caches for perlin noise generation, which reduce the amount of redundant calculations
 * if sampling is done more than once. Their domain can be changed at runtime, which makes this cache
 * *dynamic* (as opposed to `perlin3d.staticCache`, which is simpler at the cost of rigidity).
 *
 * @deprecated Use `perlin3d.cache`. Define it once with `perlin3d.cache.define(root)`, and instantiate it again
 * whenever the size changes, filling it with `cache.step(pass)`. Plug `perlin3d.getCachedJunctionGradient`
 * into `perlin3d.getJunctionGradientSlot` and bind `cache.bindGroup` in your pipeline.
 *
 * @param options A set of general options for instances of this cache configuration.
 *
 * --- Basic usage
 * @example
 * ```ts
 * const perlinCacheConfig = perlin3d.dynamicCacheConfig();
 * // Contains all resources that the perlin cache needs access to
 * const dynamicLayout = tgpu.bindGroupLayout({ ...perlinCacheConfig.layout });
 *
 * // ...
 *
 * const root = await tgpu.init();
 * // Instantiating the cache with an initial size.
 * const perlinCache = perlinCacheConfig.instance(root, d.vec3u(10, 10, 1));
 *
 * const pipeline = root
 *   // Plugging the cache into the pipeline
 *   .pipe(perlinCacheConfig.inject(dynamicLayout.$))
 *   // ...
 *   .createRenderPipeline({
 *     // ...
 *   });
 *
 * const frame = () => {
 *   // A bind group to fulfill the resource needs of the cache
 *   const group = root.createBindGroup(dynamicLayout, { ...perlinCache.bindings });
 *
 *   pipeline
 *     .with(group)
 *     // ...
 *     .draw(3);
 * };
 * ```
 */
export function dynamicCacheConfig(options?: {
  /**
   * A string of characters that gets prepended to every
   * resource this cache operates on
   * @default 'perlin3dCache__'
   */
  prefix?: undefined;
}): DynamicPerlin3DCacheConfig<typeof DefaultPerlin3DLayoutPrefix>;

/** @deprecated Use `perlin3d.cache`. */
export function dynamicCacheConfig<Prefix extends string>(options?: {
  /**
   * A string of characters that gets prepended to every
   * resource this cache operates on
   * @default 'perlin3dCache__'
   */
  prefix: Prefix;
}): DynamicPerlin3DCacheConfig<Prefix>;

export function dynamicCacheConfig<Prefix extends string>(options?: {
  prefix?: Prefix | undefined;
}): DynamicPerlin3DCacheConfig<Prefix> {
  const { prefix = DefaultPerlin3DLayoutPrefix as Prefix } = options ?? {};

  const instance = (root: TgpuRoot, initialSize: d.v3u): DynamicPerlin3DCache<Prefix> => {
    const definition = define(root);
    let cache = instantiate(root, definition, { size: initialSize });
    fillNow(root, cache);
    let dirty = false;

    return {
      get size() {
        return cache.size;
      },
      get bindings() {
        if (dirty) {
          fillNow(root, cache);
          dirty = false;
        }

        return {
          [`${prefix}size` as const]: cache.buffers.size,
          [`${prefix}memory` as const]: cache.buffers.memory,
        } as Bindings<Prefix>;
      },
      set size(value: d.v3u) {
        if (allEq(cache.size, value)) {
          // Nothing to update
          return;
        }
        cache.destroy();
        cache = instantiate(root, definition, { size: value });
        dirty = true;
      },
      destroy() {
        cache.destroy();
      },
    };
  };

  return {
    layout: {
      [`${prefix}size`]: { uniform: d.vec4u },
      [`${prefix}memory`]: { storage: MemorySchema, access: 'readonly' },
    } as Layout<Prefix>,
    getJunctionGradient: getCachedJunctionGradient,
    instance,

    inject: (layoutValue) => (cfg) =>
      cfg
        .with(getJunctionGradientSlot, getCachedJunctionGradient)
        .with(cacheSizeAccess, () => layoutValue[`${prefix}size`] as SizeIn)
        .with(cacheMemoryAccess, () => layoutValue[`${prefix}memory`] as MemoryIn),
  };
}
