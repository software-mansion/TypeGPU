import tgpu, {
  type Configurable,
  type StorageFlag,
  type TgpuBuffer,
  type TgpuFn,
  type TgpuRoot,
  type TgpuSlot,
  type UniformFlag,
} from 'typegpu';
import * as d from 'typegpu/data';
import { allEq } from 'typegpu/std';
import type { PrefixKeys, Prettify } from '../utils.ts';
import {
  computeJunctionGradient,
  getJunctionGradientSlot,
} from './algorithm.ts';

const MemorySchema = (n: number) => d.arrayOf(d.vec2f, n);

type Layout<Prefix extends string> = Prettify<
  PrefixKeys<Prefix, {
    readonly size: { uniform: d.Vec2u };
    readonly memory: {
      storage: typeof MemorySchema;
      access: 'readonly';
    };
  }>
>;

type LayoutValue<Prefix extends string> = Prettify<
  PrefixKeys<Prefix, {
    readonly size: d.v2u;
    readonly memory: d.v2f[];
  }>
>;

type Bindings<Prefix extends string> = Prettify<
  PrefixKeys<Prefix, {
    size: TgpuBuffer<d.Vec2u> & UniformFlag;
    memory: TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;
  }>
>;

export interface DynamicPerlin2DCacheConfig<Prefix extends string> {
  readonly layout: Layout<Prefix>;
  readonly valuesSlot: TgpuSlot<LayoutValue<Prefix>>;
  readonly getJunctionGradient: TgpuFn<(pos: d.Vec2i) => d.Vec2f>;

  instance(
    root: TgpuRoot,
    initialSize: d.v2u,
  ): DynamicPerlin2DCache<Prefix>;

  inject(
    layoutValue: LayoutValue<Prefix>,
  ): (cfg: Configurable) => Configurable;
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
 * @param options A set of general options for instances of this cache configuration.
 *
 * ### Basic usage
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
 *   .withFragment(mainFragment)
 *   .createPipeline();
 *
 * const frame = () => {
 *   // A bind group to fulfill the resource needs of the cache
 *   const group = root.createBindGroup(dynamicLayout, { ...cache.bindings });
 *
 *   pipeline
 *     .with(dynamicLayout, group)
 *     // ...
 *     .draw(3);
 * };
 * ```
 */
export function dynamicCacheConfig(
  options?: {
    /**
     * A string of characters that gets prepended to every
     * resource this cache operates on
     * @default 'perlin2dCache__'
     */
    prefix?: undefined;
  },
): DynamicPerlin2DCacheConfig<typeof DefaultPerlin2DLayoutPrefix>;

export function dynamicCacheConfig<Prefix extends string>(
  options?: {
    /**
     * A string of characters that gets prepended to every
     * resource this cache operates on
     * @default 'perlin2dCache__'
     */
    prefix: Prefix;
  },
): DynamicPerlin2DCacheConfig<Prefix>;

export function dynamicCacheConfig<Prefix extends string>(
  options?: { prefix?: Prefix | undefined },
): DynamicPerlin2DCacheConfig<Prefix> {
  const { prefix = DefaultPerlin2DLayoutPrefix as Prefix } = options ?? {};

  const valuesSlot = tgpu.slot<LayoutValue<Prefix>>();

  const cleanValuesSlot = tgpu['~unstable'].derived(() => {
    return {
      get size() {
        return (valuesSlot.$ as Record<`${Prefix}size`, d.v2u>)[
          `${prefix}size`
        ] as d.v2u;
      },
      get memory() {
        return (valuesSlot.$ as Record<`${Prefix}memory`, d.v2f[]>)[
          `${prefix}memory`
        ] as d.v2f[];
      },
    };
  });

  const getJunctionGradient = tgpu.fn([d.vec2i], d.vec2f)((pos) => {
    const size = d.vec2i(cleanValuesSlot.value.size);
    const x = (pos.x % size.x + size.x) % size.x;
    const y = (pos.y % size.y + size.y) % size.y;

    return cleanValuesSlot.value.memory[x + y * size.x] as d.v2f;
  });

  const computeLayout = tgpu.bindGroupLayout({
    size: { uniform: d.vec2u },
    memory: { storage: MemorySchema, access: 'mutable' },
  });

  const mainCompute = tgpu['~unstable'].computeFn({
    workgroupSize: [1, 1, 1],
    in: { gid: d.builtin.globalInvocationId },
  })((input) => {
    const size = computeLayout.$.size;
    const idx = input.gid.x + input.gid.y * size.x;

    computeLayout.$.memory[idx] = computeJunctionGradient(
      d.vec2i(input.gid.xy),
    );
  });

  const instance = (
    root: TgpuRoot,
    initialSize: d.v2u,
  ): DynamicPerlin2DCache<Prefix> => {
    let dirty = false;
    let size = initialSize;

    const sizeBuffer = root
      .createBuffer(d.vec2u, size)
      .$usage('uniform');

    const computePipeline = root['~unstable']
      .withCompute(mainCompute)
      .createPipeline();

    const createMemory = () => {
      const memory = root
        .createBuffer(d.arrayOf(d.vec2f, size.x * size.y))
        .$usage('storage');

      const computeBindGroup = root.createBindGroup(computeLayout, {
        size: sizeBuffer,
        memory,
      });

      computePipeline
        .with(computeLayout, computeBindGroup)
        .dispatchWorkgroups(size.x, size.y);

      return memory;
    };

    let memoryBuffer = createMemory();

    return {
      get size() {
        return size;
      },
      get bindings() {
        if (dirty) {
          memoryBuffer.destroy();
          memoryBuffer = createMemory();
        }

        return {
          [`${prefix}size` as const]: sizeBuffer,
          [`${prefix}memory` as const]: memoryBuffer,
        } as Bindings<Prefix>;
      },
      set size(value: d.v2u) {
        if (allEq(size, value)) {
          // Nothing to update
          return;
        }
        size = value;
        sizeBuffer.write(size);
        dirty = true;
      },
      destroy() {
        sizeBuffer.destroy();
        memoryBuffer.destroy();
      },
    };
  };

  return {
    layout: {
      [`${prefix}size`]: { uniform: d.vec2u },
      [`${prefix}memory`]: { storage: MemorySchema, access: 'readonly' },
    } as Layout<Prefix>,
    valuesSlot,
    getJunctionGradient,
    instance,

    inject: (layoutValue) => (cfg) =>
      cfg
        .with(getJunctionGradientSlot, getJunctionGradient)
        .with(valuesSlot, layoutValue),
  };
}
