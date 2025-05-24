import tgpu, {
  type StorageFlag,
  type TgpuBuffer,
  type TgpuFn,
  type TgpuRoot,
  type UniformFlag,
} from 'typegpu';
import * as d from 'typegpu/data';
import type { PrefixKeys, Prettify } from '../utils.ts';
import { computeJunctionGradient } from './algorithm.ts';
import { allEq } from 'typegpu/std';

const MemorySchema = (n: number) => d.arrayOf(d.vec3f, n);

type Layout<Prefix extends string> = Prettify<
  PrefixKeys<Prefix, {
    readonly size: { uniform: d.Vec3u };
    readonly memory: {
      storage: typeof MemorySchema;
      access: 'readonly';
    };
  }>
>;

type Bindings<Prefix extends string> = Prettify<
  PrefixKeys<Prefix, {
    size: TgpuBuffer<d.Vec3u> & UniformFlag;
    memory: TgpuBuffer<d.WgslArray<d.Vec3f>> & StorageFlag;
  }>
>;

export interface DynamicPerlin3DCache<Prefix extends string> {
  readonly layout: Layout<Prefix>;
  readonly getJunctionGradient: TgpuFn<[pos: d.Vec3i], d.Vec3f>;

  instance(
    root: TgpuRoot,
    initialSize: d.v3u,
  ): DynamicPerlin3DCacheInstance<Prefix>;
}

export interface DynamicPerlin3DCacheInstance<Prefix extends string> {
  size: d.v3u;
  readonly bindings: Bindings<Prefix>;

  destroy(): void;
}

const DefaultPerlin3DLayoutPrefix = 'perlin3dCache__' as const;

export function dynamicCache<Prefix extends string>(
  options: { prefix: Prefix },
): DynamicPerlin3DCache<Prefix>;
export function dynamicCache(
  options: { prefix?: undefined },
): DynamicPerlin3DCache<typeof DefaultPerlin3DLayoutPrefix>;
export function dynamicCache<Prefix extends string>(
  options?: { prefix?: Prefix | undefined },
): DynamicPerlin3DCache<Prefix> {
  const { prefix = DefaultPerlin3DLayoutPrefix as Prefix } = options ?? {};

  const sizeAccess = tgpu['~unstable'].accessor(d.vec3u);
  const memoryAccess = tgpu['~unstable'].accessor(MemorySchema(0)); // TODO: Remove (0), once it's possible to do

  const getJunctionGradient = tgpu['~unstable'].fn([d.vec3i], d.vec3f)(
    (pos) => {
      const size = d.vec3u(sizeAccess.value); // TODO: Remove when not necessary
      const x = (pos.x % size.x + size.x) % size.x;
      const y = (pos.y % size.y + size.y) % size.y;
      const z = (pos.z % size.z + size.z) % size.z;

      return memoryAccess.value[x + y * size.x + z * size.x * size.y] as d.v3f;
    },
  );

  const computeLayout = tgpu.bindGroupLayout({
    memory: { storage: MemorySchema, access: 'mutable' },
  });

  const mainCompute = tgpu['~unstable'].computeFn({
    workgroupSize: [1, 1, 1],
    in: { gid: d.builtin.globalInvocationId },
  })((input) => {
    const size = d.vec3u(sizeAccess.value); // TODO: Remove when not necessary
    const idx = input.gid.x +
      input.gid.y * size.x +
      input.gid.z * size.x * size.y;

    computeLayout.$.memory[idx] = computeJunctionGradient(
      d.vec3i(input.gid.xyz),
    );
  });

  const instance = (
    root: TgpuRoot,
    initialSize: d.v3u,
  ): DynamicPerlin3DCacheInstance<Prefix> => {
    let dirty = false;
    let size = initialSize;

    const computePipeline = root['~unstable']
      .withCompute(mainCompute)
      .createPipeline();

    const sizeBuffer = root
      .createBuffer(d.vec3u)
      .$usage('uniform');

    const createMemory = () => {
      return root
        .createBuffer(d.arrayOf(d.vec3f, size.x * size.y * size.z))
        .$usage('storage');
    };

    let memoryBuffer = createMemory();
    computePipeline.dispatchWorkgroups(size.x, size.y, size.z);

    return {
      get size() {
        return size;
      },
      get bindings() {
        if (dirty) {
          memoryBuffer.destroy();
          memoryBuffer = createMemory();
          computePipeline.dispatchWorkgroups(size[0], size[1], size[2]);
        }

        return {
          [`${prefix}size` as const]: sizeBuffer,
          [`${prefix}memory` as const]: memoryBuffer,
        } as Bindings<Prefix>;
      },
      set size(value: d.v3u) {
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
      [`${prefix}size`]: { uniform: d.vec3u },
      [`${prefix}memory`]: { storage: MemorySchema, access: 'readonly' },
    } as Layout<Prefix>,
    getJunctionGradient,
    instance,
  };
}
