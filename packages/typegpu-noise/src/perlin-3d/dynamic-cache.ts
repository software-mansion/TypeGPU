import tgpu, {
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
import { computeJunctionGradient, getJunctionGradientSlot } from './algorithm.ts';

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

  const sizeAccess = tgpu.accessor(d.vec4u);
  const memoryAccess = tgpu.accessor(MemorySchema);

  const getJunctionGradient = tgpu.fn(
    [d.vec3i],
    d.vec3f,
  )((pos) => {
    const size = d.vec3i(sizeAccess.$.xyz);
    const x = ((pos.x % size.x) + size.x) % size.x;
    const y = ((pos.y % size.y) + size.y) % size.y;
    const z = ((pos.z % size.z) + size.z) % size.z;

    return memoryAccess.$[x + y * size.x + z * size.x * size.y] as d.v3f;
  });

  const computeLayout = tgpu.bindGroupLayout({
    size: { uniform: d.vec4u },
    memory: { storage: MemorySchema, access: 'mutable' },
  });

  const mainCompute = (x: number, y: number, z: number) => {
    'use gpu';
    const size = computeLayout.$.size;
    const idx = x + y * size.x + z * size.x * size.y;

    computeLayout.$.memory[idx] = computeJunctionGradient(d.vec3i(x, y, z));
  };

  const instance = (root: TgpuRoot, initialSize: d.v3u): DynamicPerlin3DCache<Prefix> => {
    let dirty = false;
    let size = d.vec4u(initialSize, 0);

    const sizeBuffer = root.createBuffer(d.vec4u, size).$usage('uniform');

    const computePipeline = root.createGuardedComputePipeline(mainCompute);

    const createMemory = () => {
      const memory = root
        .createBuffer(d.arrayOf(d.vec3f, size.x * size.y * size.z))
        .$usage('storage');

      const computeBindGroup = root.createBindGroup(computeLayout, {
        size: sizeBuffer,
        memory,
      });

      computePipeline.with(computeBindGroup).dispatchThreads(size.x, size.y, size.z);

      return memory;
    };

    let memoryBuffer = createMemory();

    return {
      get size() {
        return size.xyz;
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
      set size(_value: d.v3u) {
        const value = d.vec4u(_value, 0); // temporary workaround because of vec3u uniform breaking on Safari
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
      [`${prefix}size`]: { uniform: d.vec4u },
      [`${prefix}memory`]: { storage: MemorySchema, access: 'readonly' },
    } as Layout<Prefix>,
    getJunctionGradient,
    instance,

    inject: (layoutValue) => (cfg) =>
      cfg
        .with(getJunctionGradientSlot, getJunctionGradient)
        .with(sizeAccess, () => layoutValue[`${prefix}size`] as SizeIn)
        .with(memoryAccess, () => layoutValue[`${prefix}memory`] as MemoryIn),
  };
}
