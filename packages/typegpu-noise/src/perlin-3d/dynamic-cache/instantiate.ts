import type {
  Configurable,
  d,
  StorageFlag,
  TgpuBindGroup,
  TgpuBuffer,
  TgpuComputePass,
  TgpuRoot,
  UniformFlag,
} from 'typegpu';
import type {
  Perlin3DDynamicCacheDefinition,
  Perlin3DDynamicCacheFillLayoutEntries,
  Perlin3DDynamicCacheLayoutEntries,
} from './define.ts';

/**
 * @category Module
 */
export interface Perlin3DDynamicCacheIo {
  /**
   * How many junctions the cache holds along each axis. Sampling outside of it wraps around.
   */
  size: d.v3u;
}

/**
 * @category Module
 */
export interface Perlin3DDynamicCacheInstance {
  /**
   * What this instance was made from. Use it to make more instances, e.g. of a different size.
   */
  readonly definition: Perlin3DDynamicCacheDefinition;
  readonly size: d.v3u;
  /**
   * Bind it in every pipeline that had the cache plugged in with `inject()`.
   */
  readonly bindGroup: TgpuBindGroup<Perlin3DDynamicCacheLayoutEntries>;
  readonly buffers: {
    readonly size: TgpuBuffer<d.Vec4u> & UniformFlag;
    readonly memory: TgpuBuffer<d.WgslArray<d.Vec3f>> & StorageFlag;
  };
  /**
   * Makes `perlin3d.sample` read gradients from the cache, same as `definition.inject()`.
   * Bind `bindGroup` when using the pipeline.
   *
   * @example
   * ```ts
   * const pipeline = root.pipe(cache.inject()).createRenderPipeline({ ... });
   *
   * pipeline.with(cache.bindGroup).draw(3);
   * ```
   */
  inject(): (cfg: Configurable) => Configurable;
  /**
   * Fills the cache. Run it once before sampling.
   */
  step(pass: TgpuComputePass | GPUComputePassEncoder): void;
  initSync(): void;
  initAsync(): Promise<void>;
  destroy(): void;
  [Symbol.dispose](): void;
}

const MODULE = 'perlin3d.dynamicCache';

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Allocates a 3D Perlin noise cache of the given size. Fill it with `instance.step(pass)` before sampling.
 * To resize, make another instance from the same definition.
 *
 * @category Module
 */
export function instantiate(
  root: TgpuRoot,
  definition: Perlin3DDynamicCacheDefinition,
  io: Perlin3DDynamicCacheIo,
): Perlin3DDynamicCacheInstance {
  const size = io.size.xyz;
  if (!isPositiveInteger(size.x) || !isPositiveInteger(size.y) || !isPositiveInteger(size.z)) {
    throw new Error(
      `${MODULE}: size has to be made of positive integers, got (${size.x}, ${size.y}, ${size.z})`,
    );
  }

  const { entries } = definition.layout;
  const sizeBuffer = root
    // `w` is unused, the size is a vec4u because vec3u uniforms break on Safari
    .createBuffer(entries.size.uniform, [size.x, size.y, size.z, 0])
    .$usage('uniform');
  const memoryBuffer = root
    .createBuffer(entries.memory.storage(size.x * size.y * size.z))
    .$usage('storage');

  const bindGroup = root.createBindGroup(definition.layout, {
    size: sizeBuffer,
    memory: memoryBuffer,
  });
  const fillBindGroup: TgpuBindGroup<Perlin3DDynamicCacheFillLayoutEntries> = root.createBindGroup(
    definition.fillLayout,
    { size: sizeBuffer, memory: memoryBuffer },
  );

  const [wgX, wgY, wgZ] = definition.workgroupSize;
  const groupsX = Math.ceil(size.x / wgX);
  const groupsY = Math.ceil(size.y / wgY);
  const groupsZ = Math.ceil(size.z / wgZ);

  let destroyed = false;
  const assertAlive = (method: string) => {
    if (destroyed) {
      throw new Error(`${MODULE}: '${method}' was called after 'destroy()'`);
    }
  };

  const destroy = () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    sizeBuffer.destroy();
    memoryBuffer.destroy();
  };

  return {
    definition,
    get size() {
      return size.xyz;
    },
    bindGroup,
    buffers: { size: sizeBuffer, memory: memoryBuffer },
    inject: () => definition.inject(),
    step(pass) {
      assertAlive('step');
      const pipeline = definition.fillPipeline.with(fillBindGroup);
      const withPass = 'resourceType' in pass ? pipeline.with(pass) : pipeline.with(pass);
      withPass.dispatchWorkgroups(groupsX, groupsY, groupsZ);
    },
    initSync() {
      assertAlive('initSync');
      definition.fillPipeline.initSync();
    },
    async initAsync() {
      assertAlive('initAsync');
      await definition.fillPipeline.initAsync();
    },
    destroy,
    [Symbol.dispose]: destroy,
  };
}
