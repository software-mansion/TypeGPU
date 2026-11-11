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
  Perlin2DCacheDefinition,
  Perlin2DCacheFillLayoutEntries,
  Perlin2DCacheLayoutEntries,
} from './define.ts';

/**
 * @category Module
 */
export interface Perlin2DCacheIo {
  /**
   * How many junctions the cache holds along each axis. Sampling outside of it wraps around.
   */
  size: d.v2u;
}

/**
 * @category Module
 */
export interface Perlin2DCacheInstance {
  readonly size: d.v2u;
  /**
   * Bind it in every pipeline that reads the cache through `perlin2d.getCachedJunctionGradient`.
   */
  readonly bindGroup: TgpuBindGroup<Perlin2DCacheLayoutEntries>;
  readonly buffers: {
    readonly size: TgpuBuffer<d.Vec2u> & UniformFlag;
    readonly memory: TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;
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

const MODULE = 'perlin2d.cache';

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Allocates a 2D Perlin noise cache of the given size. Fill it with `instance.step(pass)` before sampling.
 *
 * @category Module
 */
export function instantiate(
  root: TgpuRoot,
  definition: Perlin2DCacheDefinition,
  io: Perlin2DCacheIo,
): Perlin2DCacheInstance {
  const size = io.size.xy;
  if (!isPositiveInteger(size.x) || !isPositiveInteger(size.y)) {
    throw new Error(
      `${MODULE}: size has to be made of positive integers, got (${size.x}, ${size.y})`,
    );
  }

  const { entries } = definition.layout;
  const sizeBuffer = root.createBuffer(entries.size.uniform, size).$usage('uniform');
  const memoryBuffer = root.createBuffer(entries.memory.storage(size.x * size.y)).$usage('storage');

  const bindGroup = root.createBindGroup(definition.layout, {
    size: sizeBuffer,
    memory: memoryBuffer,
  });
  const fillBindGroup: TgpuBindGroup<Perlin2DCacheFillLayoutEntries> = root.createBindGroup(
    definition.fillLayout,
    { size: sizeBuffer, memory: memoryBuffer },
  );

  const [wgX, wgY] = definition.workgroupSize;
  const groupsX = Math.ceil(size.x / wgX);
  const groupsY = Math.ceil(size.y / wgY);

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
      return size.xy;
    },
    bindGroup,
    buffers: { size: sizeBuffer, memory: memoryBuffer },
    step(pass) {
      assertAlive('step');
      const pipeline = definition.fillPipeline.with(fillBindGroup);
      const withPass = 'resourceType' in pass ? pipeline.with(pass) : pipeline.with(pass);
      withPass.dispatchWorkgroups(groupsX, groupsY);
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
