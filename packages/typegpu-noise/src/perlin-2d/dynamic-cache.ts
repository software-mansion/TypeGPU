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

const MemorySchema = d.arrayOf(d.vec2f);

type Layout<Prefix extends string> = Prettify<
  PrefixKeys<
    Prefix,
    {
      readonly size: { uniform: d.Vec2u };
      readonly memory: {
        storage: typeof MemorySchema;
        access: 'readonly';
      };
    }
  >
>;

type SizeIn = TgpuAccessor.In<d.Vec2u>;
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
      size: TgpuBuffer<d.Vec2u> & UniformFlag;
      memory: TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;
    }
  >
>;

export interface DynamicPerlin2DCacheConfig<Prefix extends string> {
  readonly layout: Layout<Prefix>;
  readonly getJunctionGradient: TgpuFn<(pos: d.Vec2i) => d.Vec2f>;

  instance(root: TgpuRoot, initialSize: d.v2u): DynamicPerlin2DCache<Prefix>;

  inject(layoutValue: LayoutValue<Prefix>): (cfg: Configurable) => Configurable;
}

export interface DynamicPerlin2DCache<Prefix extends string> {
  size: d.v2u;
  readonly bindings: Bindings<Prefix>;

  destroy(): void;
}

const DefaultPerlin2DLayoutPrefix = 'perlin2dCache__' as const;

/**
 * Used to instantiate caches for perlin noise generation, which reduce the amount of redundant calculations
 * if sampling is done more than once. Their domain can be changed at runtime, which makes this cache
 * *dynamic* (as opposed to `perlin2d.staticCache`, which is simpler at the cost of rigidity).
 *
 * @deprecated Use `perlin2d.cache`. Define it once with `perlin2d.cache.define(root)`, and instantiate it again
 * whenever the size changes, filling it with `cache.step(pass)`. Plug `perlin2d.getCachedJunctionGradient`
 * into `perlin2d.getJunctionGradientSlot` and bind `cache.bindGroup` in your pipeline.
 *
 * @param options A set of general options for instances of this cache configuration.
 *
 * --- Basic usage
 * @example
 * ```ts
 * const cacheConfig = perlin2d.dynamicCacheConfig();
 * // Contains all resources that the perlin cache needs access to
 * const dynamicLayout = tgpu.bindGroupLayout({ ...cacheConfig.layout });
 *
 * // ...
 *
 * const root = await tgpu.init();
 * // Instantiating the cache with an initial size.
 * const cache = cacheConfig.instance(root, d.vec2u(10, 10));
 *
 * const pipeline = root
 *   // Plugging the cache into the pipeline
 *   .pipe(cacheConfig.inject(dynamicLayout.$))
 *   // ...
 *   .createRenderPipeline({
 *     // ...
 *   });
 *
 * const frame = () => {
 *   // A bind group to fulfill the resource needs of the cache
 *   const group = root.createBindGroup(dynamicLayout, { ...cache.bindings });
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
   * @default 'perlin2dCache__'
   */
  prefix?: undefined;
}): DynamicPerlin2DCacheConfig<typeof DefaultPerlin2DLayoutPrefix>;

/** @deprecated Use `perlin2d.cache`. */
export function dynamicCacheConfig<Prefix extends string>(options?: {
  /**
   * A string of characters that gets prepended to every
   * resource this cache operates on
   * @default 'perlin2dCache__'
   */
  prefix: Prefix;
}): DynamicPerlin2DCacheConfig<Prefix>;

export function dynamicCacheConfig<Prefix extends string>(options?: {
  prefix?: Prefix | undefined;
}): DynamicPerlin2DCacheConfig<Prefix> {
  const { prefix = DefaultPerlin2DLayoutPrefix as Prefix } = options ?? {};

  const instance = (root: TgpuRoot, initialSize: d.v2u): DynamicPerlin2DCache<Prefix> => {
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
      set size(value: d.v2u) {
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
      [`${prefix}size`]: { uniform: d.vec2u },
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
