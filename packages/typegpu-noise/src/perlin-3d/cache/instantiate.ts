import type {
  d,
  StorageFlag,
  TgpuBindGroup,
  TgpuBuffer,
  TgpuComputePass,
  TgpuRoot,
  UniformFlag,
} from 'typegpu';
import type {
  Perlin3DCacheDefinition,
  Perlin3DCacheFillLayoutEntries,
  Perlin3DCacheLayoutEntries,
} from './define.ts';

/**
 * @category Module
 */
export interface Perlin3DCacheIo {
  /**
   * How many junctions the cache holds along each axis. Sampling outside of it wraps around.
   */
  size: d.v3u;
}

/**
 * @category Module
 */
export interface Perlin3DCacheInstance {
  readonly size: d.v3u;
  /**
   * Bind it in every pipeline that reads the cache through `perlin3d.getCachedJunctionGradient`.
   */
  readonly bindGroup: TgpuBindGroup<Perlin3DCacheLayoutEntries>;
  readonly buffers: {
    readonly size: TgpuBuffer<d.Vec4u> & UniformFlag;
    readonly memory: TgpuBuffer<d.WgslArray<d.Vec3f>> & StorageFlag;
  };
  /**
   * Fills the cache. Run it once before sampling.
   */
  step(pass: TgpuComputePass | GPUComputePassEncoder): void;
  initSync(): void;
  initAsync(): Promise<void>;
  destroy(): void;
  [Symbol.dispose](): void;
}

const MODULE = 'perlin3d.cache';

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Allocates a 3D Perlin noise cache of the given size. Fill it with `instance.step(pass)` before sampling.
 *
 * @category Module
 */
export function instantiate(
  root: TgpuRoot,
  definition: Perlin3DCacheDefinition,
  io: Perlin3DCacheIo,
): Perlin3DCacheInstance {
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
  const fillBindGroup: TgpuBindGroup<Perlin3DCacheFillLayoutEntries> = root.createBindGroup(
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
    get size() {
      return size.xyz;
    },
    bindGroup,
    buffers: { size: sizeBuffer, memory: memoryBuffer },
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
