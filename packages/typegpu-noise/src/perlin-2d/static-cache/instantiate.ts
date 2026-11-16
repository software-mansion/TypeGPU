import type {
  Configurable,
  d,
  StorageFlag,
  TgpuBindGroup,
  TgpuBuffer,
  TgpuComputePass,
  TgpuRoot,
} from 'typegpu';
import type {
  Perlin2DStaticCacheDefinition,
  Perlin2DStaticCacheFillLayoutEntries,
  Perlin2DStaticCacheLayoutEntries,
} from './define.ts';

/**
 * Nothing is decided at runtime, the size is part of the definition.
 *
 * @category Module
 */
export type Perlin2DStaticCacheIo = Record<string, never>;

/**
 * @category Module
 */
export interface Perlin2DStaticCacheInstance {
  /**
   * What this instance was made from.
   */
  readonly definition: Perlin2DStaticCacheDefinition;
  readonly size: d.v2u;
  /**
   * Bind it in every pipeline that had the cache plugged in with `inject()`.
   */
  readonly bindGroup: TgpuBindGroup<Perlin2DStaticCacheLayoutEntries>;
  readonly buffers: {
    readonly memory: TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;
  };
  /**
   * Makes `perlin2d.sample` read gradients from the cache, same as `definition.inject()`.
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

const MODULE = 'perlin2d.staticCache';

/**
 * Allocates a 2D Perlin noise cache of the size its definition was made for.
 * Fill it with `instance.step(pass)` before sampling.
 *
 * @category Module
 */
export function instantiate(
  root: TgpuRoot,
  definition: Perlin2DStaticCacheDefinition,
  _io: Perlin2DStaticCacheIo = {},
): Perlin2DStaticCacheInstance {
  const size = definition.size;
  const memoryBuffer = root
    .createBuffer(definition.layout.entries.memory.storage)
    .$usage('storage');

  const bindGroup = root.createBindGroup(definition.layout, { memory: memoryBuffer });
  const fillBindGroup: TgpuBindGroup<Perlin2DStaticCacheFillLayoutEntries> = root.createBindGroup(
    definition.fillLayout,
    { memory: memoryBuffer },
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
    memoryBuffer.destroy();
  };

  return {
    definition,
    get size() {
      return size.xy;
    },
    bindGroup,
    buffers: { memory: memoryBuffer },
    inject: () => definition.inject(),
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
