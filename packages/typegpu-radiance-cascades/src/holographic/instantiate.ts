import type {
  SampledFlag,
  StorageFlag,
  TgpuBindGroup,
  TgpuComputePass,
  TgpuComputePipeline,
  TgpuRoot,
  TgpuTexture,
} from 'typegpu';
import type { HolographicDefinition } from './define.ts';
import { getByteSize, getDispatchSize, getLayout, getPasses } from './layout.ts';

/** @category Module */
export type HolographicOutputTexture = TgpuTexture<{
  size: [number, number];
  format: 'rgba16float';
}> &
  StorageFlag &
  SampledFlag;

/** @category Module */
export type HolographicSectorTexture = TgpuTexture<{
  size: [number, number, number];
  format: 'rgba16float';
}> &
  StorageFlag &
  SampledFlag;

/**
 * Sizes and resources of one holographic runner instance.
 * @category Module
 */
export type HolographicIo = {
  /** Material grid and lighting texture dimensions in pixels. Both must be at least 2. */
  size: { width: number; height: number };
  /** Solves per `step`. Each step starts from zero incident light. Default: 1 */
  iterations?: number | undefined;
  /** Texture to write the mean radiance into. Created by the instance when omitted. */
  output?: HolographicOutputTexture | undefined;
  /** Four-layer texture to write the sector radiance into. Created by the instance when omitted. */
  sectors?: HolographicSectorTexture | undefined;
  /** Bind groups for explicit layouts that the `medium` and `source` callbacks read. */
  bindGroups?: readonly TgpuBindGroup[] | undefined;
};

/** @category Module */
export interface HolographicInstance {
  /** Angular mean radiance, normalized by 2π */
  readonly output: HolographicOutputTexture;
  /** Radiance from the +X, +Y, −X and −Y sectors, one layer each */
  readonly sectors: HolographicSectorTexture;
  /** Logical size of the allocations owned by the instance */
  readonly byteSize: number;
  /** Solves per `step`. Takes effect from the next recording. */
  iterations: number;
  /** Records `iterations` solves into a compute pass. Does not end the pass. */
  step(pass: TgpuComputePass | GPUComputePassEncoder): void;
  /** Optional: compiles the pipelines ahead of the first step. */
  initSync(): void;
  /** Optional: compiles the pipelines ahead of the first step. */
  initAsync(): Promise<void>;
  /** Frees the textures and buffers the instance created. Safe to call twice. */
  destroy(): void;
  [Symbol.dispose](): void;
}

function checkIterations(iterations: number) {
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error('iterations must be a positive integer.');
  }
  return iterations;
}

/**
 * Allocates the interval pyramid and lighting textures for one grid size.
 * @category Module
 */
export function instantiate(
  root: TgpuRoot,
  definition: HolographicDefinition,
  io: HolographicIo,
): HolographicInstance {
  const { layouts, schemas, pipelines, rgb, hasSource, tracedLevels } = definition;
  const size = [io.size.width, io.size.height] as const;
  const bindGroups = io.bindGroups ?? [];
  let iterations = checkIterations(io.iterations ?? 1);
  if (!(size[0] >= 2 && size[1] >= 2) || !Number.isInteger(size[0] + size[1])) {
    throw new Error('Both dimensions must be integers of at least 2 pixels.');
  }
  for (const [name, texture, depth] of [
    ['output', io.output, 1],
    ['sectors', io.sectors, 4],
  ] as const) {
    if (!texture) continue;
    const [width, height, layers = 1] = texture.props.size;
    if (width !== size[0] || height !== size[1] || layers !== depth) {
      throw new Error(`The ${name} texture has to be ${size[0]}×${size[1]}×${depth}.`);
    }
  }

  const info = getLayout(size);
  const pyramid = info.intervalCounts.map((count) =>
    root.createBuffer(schemas.Intervals(count)).$usage('storage'),
  );
  const radiance = [0, 1].map(() =>
    root.createBuffer(schemas.Fluence(info.fluenceCount)).$usage('storage'),
  );
  const pixelCount = size[0] * size[1];
  const feedback = hasSource
    ? root.createBuffer(schemas.Fluence(pixelCount)).$usage('storage')
    : undefined;
  const ownSectors = io.sectors
    ? undefined
    : root
        .createTexture({ size: [size[0], size[1], 4], format: 'rgba16float' })
        .$usage('storage', 'sampled');
  const ownOutput = io.output
    ? undefined
    : root
        .createTexture({ size: [size[0], size[1]], format: 'rgba16float' })
        .$usage('storage', 'sampled');
  const sectors = (io.sectors ?? ownSectors) as HolographicSectorTexture;
  const output = (io.output ?? ownOutput) as HolographicOutputTexture;

  const withBindGroups = (pipeline: TgpuComputePipeline, groups: readonly TgpuBindGroup[]) =>
    [...groups, ...bindGroups].reduce((bound, group) => bound.with(group), pipeline);
  const feedbackGroups = feedback
    ? [root.createBindGroup(layouts.feedback, { feedback })]
    : ([] as TgpuBindGroup[]);

  // Every pass reads its own uniform, written once here, so steps never write to the queue
  const worldSize = [size[0], size[1]] as const;
  const plan = getPasses(size, tracedLevels);
  const params = plan.map((pass) =>
    root.createUniform(schemas.PassParams, {
      worldSize,
      quadrant: pass.quadrant,
      width: pass.width,
      height: pass.height,
      step: pass.step,
      count: pass.count,
      rowSize: pass.dispatchSize[0] * 64,
      top: pass.kind === 'down' && pass.top ? 1 : 0,
    }),
  );
  const sectorGroup = root.createBindGroup(layouts.sectorTarget, { sectors });

  const passes = plan.map((pass, i) => {
    const uniform = params[i] as (typeof params)[number];
    if (pass.kind === 'up') {
      const group = root.createBindGroup(layouts.intervals, {
        params: uniform,
        source: pyramid[pass.source] as (typeof pyramid)[number],
        target: pyramid[pass.target] as (typeof pyramid)[number],
      });
      const pipeline = pass.traced ? pipelines.extendTraced : pipelines.extendMerged;
      return {
        pipeline: withBindGroups(pipeline, [group, ...feedbackGroups]),
        dispatchSize: pass.dispatchSize,
      };
    }

    const group = root.createBindGroup(layouts.fluence, {
      params: uniform,
      near: pyramid[pass.near] as (typeof pyramid)[number],
      far: pyramid[pass.far] as (typeof pyramid)[number],
      upper: radiance[pass.upper] as (typeof radiance)[number],
      target: radiance[pass.target] as (typeof radiance)[number],
    });
    return {
      pipeline: pass.final
        ? withBindGroups(pipelines.gatherFinal, [group, sectorGroup])
        : withBindGroups(pipelines.gather, [group]),
      dispatchSize: pass.dispatchSize,
    };
  });

  const pixelDispatch = getDispatchSize(pixelCount);
  const pixelParams = root.createUniform(schemas.PixelParams, {
    size: worldSize,
    count: pixelCount,
    rowSize: pixelDispatch[0] * 64,
  });
  const pixelGroup = root.createBindGroup(layouts.pixels, { params: pixelParams });
  passes.push({
    pipeline: withBindGroups(pipelines.integrate, [
      pixelGroup,
      root.createBindGroup(layouts.resolve, { sectors, output }),
      ...feedbackGroups,
    ]),
    dispatchSize: pixelDispatch,
  });

  const sources = [pipelines.sourceFirst, pipelines.sourceNext].flatMap((pipeline) =>
    pipeline ? [withBindGroups(pipeline, [pixelGroup, ...feedbackGroups])] : [],
  );

  const byteSize = getByteSize(size, rgb, hasSource);

  let destroyed = false;
  function assertAlive() {
    if (destroyed) {
      throw new Error('@typegpu/radiance-cascades/holographic: the instance has been destroyed.');
    }
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    for (const buffer of [...pyramid, ...radiance]) buffer.destroy();
    for (const uniform of [...params, pixelParams]) uniform.buffer.destroy();
    feedback?.destroy();
    ownSectors?.destroy();
    ownOutput?.destroy();
  }

  const definitionPipelines = Object.values(pipelines).filter(
    (pipeline): pipeline is TgpuComputePipeline => pipeline !== undefined,
  );

  return {
    output,
    sectors,
    byteSize,
    get iterations() {
      return iterations;
    },
    set iterations(value) {
      iterations = checkIterations(value);
    },
    step(pass) {
      assertAlive();
      const computePass = pass as TgpuComputePass;
      for (let iteration = 0; iteration < iterations; iteration++) {
        sources[iteration === 0 ? 0 : 1]?.with(computePass).dispatchWorkgroups(...pixelDispatch);
        for (const { pipeline, dispatchSize } of passes) {
          pipeline.with(computePass).dispatchWorkgroups(...dispatchSize);
        }
      }
    },
    initSync() {
      assertAlive();
      for (const pipeline of definitionPipelines) {
        pipeline.initSync();
      }
    },
    async initAsync() {
      assertAlive();
      await Promise.all(definitionPipelines.map((pipeline) => pipeline.initAsync()));
    },
    destroy,
    [Symbol.dispose]: destroy,
  };
}
