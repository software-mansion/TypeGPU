import type {
  SampledFlag,
  StorageFlag,
  TgpuBindGroup,
  TgpuComputePass,
  TgpuComputePipeline,
  TgpuRoot,
  TgpuTexture,
} from 'typegpu';
import type { JumpFloodDefinition } from './define.ts';

/**
 * The SDF output of the `jumpFlood` module, with the signed distance in the red channel.
 *
 * @category Module
 */
export type SdfTexture = TgpuTexture<{
  size: [number, number];
  format: 'rgba16float';
}> &
  StorageFlag &
  SampledFlag;

/**
 * The color output of the `jumpFlood` module.
 *
 * @category Module
 */
export type ColorTexture = TgpuTexture<{
  size: [number, number];
  format: 'rgba8unorm';
}> &
  StorageFlag &
  SampledFlag;

/**
 * Per-instance inputs and outputs of the `jumpFlood` module.
 *
 * @category Module
 */
export interface JumpFloodIo {
  /** Size of the flooded area, in pixels. */
  size: { width: number; height: number };
  /**
   * Bind groups for resources the `classify`, `getSdf` or `getColor` callbacks read.
   * Each one is bound to every pipeline of the flood.
   */
  bindGroups?: readonly TgpuBindGroup[] | undefined;
  /**
   * Where to write the SDF. Has to be `size` big. If omitted, the instance creates (and destroys)
   * its own.
   */
  sdfOutput?: SdfTexture | undefined;
  /**
   * Where to write the color. Has to be `size` big. If omitted, the instance creates (and
   * destroys) its own.
   */
  colorOutput?: ColorTexture | undefined;
}

/**
 * A `jumpFlood` module bound to its textures.
 *
 * @category Module
 */
export interface JumpFloodInstance {
  /** The SDF output texture (rgba16float), with the signed distance in the red channel. */
  readonly sdfOutput: SdfTexture;
  /** The color output texture (rgba8unorm). */
  readonly colorOutput: ColorTexture;
  /**
   * Records the whole flood (seeding, every flood step and the final distance pass) into `pass`.
   * Doesn't end the pass, doesn't submit, and doesn't write to the queue.
   */
  step(pass: TgpuComputePass | GPUComputePassEncoder): void;
  /** Eagerly compiles every pipeline. Calling this is optional. */
  initSync(): void;
  /** Eagerly compiles every pipeline. Calling this is optional. */
  initAsync(): Promise<void>;
  /** Destroys the textures this instance created. Borrowed outputs stay alive. */
  destroy(): void;
  [Symbol.dispose](): void;
}

/**
 * The offsets of every flood step: powers of two, from the largest one strictly less than the
 * larger dimension, down to 1.
 */
function floodOffsets(width: number, height: number): number[] {
  const maxDim = Math.max(width, height);
  const offsets: number[] = [];
  for (let offset = 2 ** Math.floor(Math.log2(Math.max(maxDim - 1, 1))); offset >= 1; offset /= 2) {
    offsets.push(offset);
  }
  return offsets;
}

/** The flood textures alternate, so step `i` uses `list[i % 2]` of a two-element list. */
function at<T>(list: T[], i: number): T {
  return list[i % 2] as T;
}

function isTgpuComputePass(pass: TgpuComputePass | GPUComputePassEncoder): pass is TgpuComputePass {
  return (pass as Partial<TgpuComputePass>).resourceType === 'compute-pass';
}

function checkSize(
  name: string,
  texture: TgpuTexture | undefined,
  width: number,
  height: number,
): void {
  if (!texture) {
    return;
  }
  const [textureWidth, textureHeight = 1] = texture.props.size;
  if (textureWidth !== width || textureHeight !== height) {
    throw new Error(
      `jumpFlood: '${name}' is ${textureWidth}x${textureHeight}, expected ${width}x${height}`,
    );
  }
}

/**
 * Allocates the textures and bind groups of one `jumpFlood` flood. Each flood step gets its own
 * offset uniform, written once here, so {@link JumpFloodInstance.step} only records.
 *
 * @category Module
 */
export function instantiate(
  root: TgpuRoot,
  definition: JumpFloodDefinition,
  io: JumpFloodIo,
): JumpFloodInstance {
  const { width, height } = io.size;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`jumpFlood: size has to be positive integers, got ${width}x${height}`);
  }
  checkSize('sdfOutput', io.sdfOutput, width, height);
  checkSize('colorOutput', io.colorOutput, width, height);

  const { pipelines, layouts, views } = definition;
  const owned: { destroy(): void }[] = [];
  const own = <T extends { destroy(): void }>(resource: T): T => {
    owned.push(resource);
    return resource;
  };

  const sdfOutput =
    io.sdfOutput ??
    own(
      root
        .createTexture({ size: [width, height], format: 'rgba16float' })
        .$usage('storage', 'sampled'),
    );
  const colorOutput =
    io.colorOutput ??
    own(
      root
        .createTexture({ size: [width, height], format: 'rgba8unorm' })
        .$usage('storage', 'sampled'),
    );
  const createFloodTexture = () =>
    own(root.createTexture({ size: [width, height], format: 'rgba16uint' }).$usage('storage'));
  const floodTextures = [createFloodTexture(), createFloodTexture()];
  const readViews = floodTextures.map((texture) => texture.createView(views.floodRead));
  const writeViews = floodTextures.map((texture) => texture.createView(views.floodWrite));
  const offsetSchema = layouts.pingPong.entries.offset.uniform;

  const extra = io.bindGroups ?? [];
  const withExtra = (pipeline: TgpuComputePipeline) =>
    extra.reduce((acc, bindGroup) => acc.with(bindGroup), pipeline);

  const init = withExtra(
    pipelines.init.with(root.createBindGroup(layouts.init, { writeView: at(writeViews, 0) })),
  );

  // The seed is written to texture 0, every flood step swaps the textures.
  const offsets = floodOffsets(width, height);
  const floodSteps = offsets.map((offset, i) =>
    withExtra(
      pipelines.flood.with(
        root.createBindGroup(layouts.pingPong, {
          readView: at(readViews, i),
          writeView: at(writeViews, i + 1),
          offset: own(root.createBuffer(offsetSchema, offset).$usage('uniform')),
        }),
      ),
    ),
  );

  const finalize = withExtra(
    pipelines.finalize
      .with(
        root.createBindGroup(layouts.finalizeRead, {
          readView: at(readViews, offsets.length),
        }),
      )
      .with(
        root.createBindGroup(layouts.distWrite, {
          sdfTexture: sdfOutput.createView(views.sdfWrite),
          colorTexture: colorOutput.createView(views.colorWrite),
        }),
      ),
  );

  const workgroupsX = Math.ceil(width / definition.workgroupSize);
  const workgroupsY = Math.ceil(height / definition.workgroupSize);
  const all = [init, ...floodSteps, finalize];
  let destroyed = false;

  const assertAlive = (method: string) => {
    if (destroyed) {
      throw new Error(`jumpFlood: called '${method}' on a destroyed instance`);
    }
  };

  const destroy = () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    for (const resource of owned) {
      resource.destroy();
    }
  };

  return {
    sdfOutput,
    colorOutput,
    step(pass) {
      assertAlive('step');
      for (const pipeline of all) {
        const bound = isTgpuComputePass(pass) ? pipeline.with(pass) : pipeline.with(pass);
        bound.dispatchWorkgroups(workgroupsX, workgroupsY);
      }
    },
    initSync() {
      assertAlive('initSync');
      for (const pipeline of all) {
        pipeline.initSync();
      }
    },
    async initAsync() {
      assertAlive('initAsync');
      await Promise.all(all.map((pipeline) => pipeline.initAsync()));
    },
    destroy,
    [Symbol.dispose]: destroy,
  };
}
