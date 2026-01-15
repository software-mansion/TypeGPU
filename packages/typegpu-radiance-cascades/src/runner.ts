import {
  isTexture,
  isTextureView,
  type SampledFlag,
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuRoot,
  type TgpuTexture,
  type TgpuTextureView,
} from 'typegpu';
import * as d from 'typegpu/data';
import {
  buildRadianceFieldBGL,
  buildRadianceFieldCompute,
  BuildRadianceFieldParams,
  CascadeParams,
  cascadePassBGL,
  cascadePassCompute,
  defaultRayMarch,
  getCascadeDim,
  rayMarchSlot,
  type SceneData,
  sceneSlot,
} from './cascades.ts';

type OutputTexture =
  | (
    & TgpuTexture<{
      size: [number, number];
      format: 'rgba16float';
    }>
    & StorageFlag
  )
  | TgpuTextureView<d.WgslStorageTexture2d<'rgba16float', 'write-only'>>;

type CascadesOptionsBase = {
  root: TgpuRoot;
  scene: (uv: d.v2f) => d.Infer<typeof SceneData>;
  /** Optional custom ray march function. Defaults to the built-in ray marcher that uses the scene slot. */
  rayMarch?: typeof defaultRayMarch;
  /**
   * Quality factor for cascade generation (0.1 to 1.0, default 0.3).
   * Higher values create more probes and cascades, improving quality at the cost of performance.
   * At low output resolutions, consider using higher quality values (0.5-1.0) for better results.
   */
  quality?: number;
};

type CascadesOptionsWithOutput = CascadesOptionsBase & {
  output: OutputTexture;
  size?: { width: number; height: number };
};

type CascadesOptionsWithoutOutput = CascadesOptionsBase & {
  output?: undefined;
  size: { width: number; height: number };
};

type OutputTextureProp =
  & TgpuTexture<{
    size: [number, number];
    format: 'rgba16float';
  }>
  & StorageFlag
  & SampledFlag;

/** Base executor type without output property (used when output is provided externally) */
export type RadianceCascadesExecutorBase = {
  /**
   * Run the radiance cascades algorithm, filling the output texture.
   */
  run(): void;

  /**
   * Returns a new executor with the additional bind group attached.
   * Use this to pass custom resources to custom ray march implementations.
   * If the pipeline doesn't use this layout, it's safely ignored.
   */
  with(bindGroup: TgpuBindGroup): RadianceCascadesExecutorBase;

  /**
   * Clean up all GPU resources created by this executor.
   */
  destroy(): void;
};

/** Executor type with owned output texture */
export type RadianceCascadesExecutor = RadianceCascadesExecutorBase & {
  /**
   * Returns a new executor with the additional bind group attached.
   */
  with(bindGroup: TgpuBindGroup): RadianceCascadesExecutor;

  /**
   * The output texture containing the radiance field.
   * Use this for sampling in your render pass.
   */
  readonly output: OutputTextureProp;
};

/**
 * Create a radiance cascades executor that renders to the provided output texture.
 */
export function createRadianceCascades(
  options: CascadesOptionsWithOutput,
): RadianceCascadesExecutorBase;

/**
 * Create a radiance cascades executor that creates and owns its own output texture.
 */
export function createRadianceCascades(
  options: CascadesOptionsWithoutOutput,
): RadianceCascadesExecutor;

export function createRadianceCascades(
  options: CascadesOptionsWithOutput | CascadesOptionsWithoutOutput,
): RadianceCascadesExecutor | RadianceCascadesExecutorBase {
  const { root, scene, output, size, rayMarch, quality = 0.3 } = options;

  const hasOutputProvided = !!output &&
    (isTexture(output) || isTextureView(output));

  // Determine output dimensions
  let outputWidth: number;
  let outputHeight: number;

  if (hasOutputProvided) {
    if (isTexture(output)) {
      [outputWidth, outputHeight] = output.props.size;
    } else {
      const viewSize = output.size ?? [size?.width, size?.height];
      if (!viewSize[0] || !viewSize[1]) {
        throw new Error(
          'Size could not be inferred from texture view, pass explicit size in options.',
        );
      }
      [outputWidth, outputHeight] = viewSize as [number, number];
    }
  } else {
    if (!size) {
      throw new Error('Size is required when output texture is not provided.');
    }
    outputWidth = size.width;
    outputHeight = size.height;
  }

  // Create output texture type
  type OwnedOutputTexture =
    & TgpuTexture<{
      size: [number, number];
      format: 'rgba16float';
    }>
    & StorageFlag
    & SampledFlag;

  // Create or use provided output texture
  let ownedOutput: OwnedOutputTexture | null = null;
  let dst: OutputTexture | OwnedOutputTexture;

  if (hasOutputProvided) {
    dst = output;
  } else {
    ownedOutput = root['~unstable']
      .createTexture({
        size: [outputWidth, outputHeight],
        format: 'rgba16float',
      })
      .$usage('storage', 'sampled');
    dst = ownedOutput;
  }

  // Compute cascade dimensions with quality factor
  const [cascadeDimX, cascadeDimY, cascadeAmount] = getCascadeDim(
    outputWidth,
    outputHeight,
    quality,
  );

  const cascadeProbesX = cascadeDimX / 2;
  const cascadeProbesY = cascadeDimY / 2;

  // Create double-buffered cascade textures
  const createCascadeTexture = () =>
    root['~unstable']
      .createTexture({
        size: [cascadeDimX, cascadeDimY, cascadeAmount],
        format: 'rgba16float',
      })
      .$usage('storage', 'sampled');

  const cascadeTextureA = createCascadeTexture();
  const cascadeTextureB = createCascadeTexture();

  // Create sampler for cascade textures
  const cascadeSampler = root['~unstable'].createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  // Create buffer for cascade parameters
  const paramsBuffer = root.createBuffer(CascadeParams).$usage('uniform');

  // Create cascade pass pipeline with scene and ray march slots bound
  const cascadePassPipeline = root['~unstable']
    .with(sceneSlot, scene)
    .with(rayMarchSlot, rayMarch ?? defaultRayMarch)
    .withCompute(cascadePassCompute)
    .createPipeline();

  // Create bind groups for all cascade passes
  const cascadePassBindGroups = Array.from(
    { length: cascadeAmount },
    (_, layer) => {
      const writeToA = (cascadeAmount - 1 - layer) % 2 === 0;
      const dstTexture = writeToA ? cascadeTextureA : cascadeTextureB;
      const srcTexture = writeToA ? cascadeTextureB : cascadeTextureA;

      return root.createBindGroup(cascadePassBGL, {
        params: paramsBuffer,
        upper: srcTexture.createView(d.texture2d(d.f32), {
          baseArrayLayer: Math.min(layer + 1, cascadeAmount - 1),
          arrayLayerCount: 1,
        }),
        upperSampler: cascadeSampler,
        dst: dstTexture.createView(
          d.textureStorage2d('rgba16float', 'write-only'),
          { baseArrayLayer: layer, arrayLayerCount: 1 },
        ),
      });
    },
  );

  // Create build radiance field pipeline
  const buildRadianceFieldPipeline = root['~unstable']
    .withCompute(buildRadianceFieldCompute)
    .createPipeline();

  // Create buffer for radiance field params
  const radianceFieldParamsBuffer = root
    .createBuffer(BuildRadianceFieldParams, {
      outputProbes: d.vec2u(outputWidth, outputHeight),
      cascadeProbes: d.vec2u(cascadeProbesX, cascadeProbesY),
      cascadeDim: d.vec2u(cascadeDimX, cascadeDimY),
    })
    .$usage('uniform');

  // Determine which cascade texture has cascade 0
  const cascade0InA = (cascadeAmount - 1) % 2 === 0;
  const srcCascadeTexture = cascade0InA ? cascadeTextureA : cascadeTextureB;

  // Get the output storage view
  type StorageTextureView = TgpuTextureView<
    d.WgslStorageTexture2d<'rgba16float', 'write-only'>
  >;
  const dstView: StorageTextureView = isTexture(dst)
    ? (
      dst as
        & TgpuTexture<{ size: [number, number]; format: 'rgba16float' }>
        & StorageFlag
    ).createView(d.textureStorage2d('rgba16float', 'write-only'))
    : dst;

  // Create bind group for building radiance field
  const buildRadianceFieldBG = root.createBindGroup(buildRadianceFieldBGL, {
    params: radianceFieldParamsBuffer,
    src: srcCascadeTexture.createView(d.texture2d(d.f32), {
      baseArrayLayer: 0,
      arrayLayerCount: 1,
    }),
    srcSampler: cascadeSampler,
    dst: dstView,
  });

  // Precompute workgroup counts
  const cascadeWorkgroupsX = Math.ceil(cascadeDimX / 8);
  const cascadeWorkgroupsY = Math.ceil(cascadeDimY / 8);
  const outputWorkgroupsX = Math.ceil(outputWidth / 8);
  const outputWorkgroupsY = Math.ceil(outputHeight / 8);

  function destroy() {
    cascadeTextureA.destroy();
    cascadeTextureB.destroy();
    ownedOutput?.destroy();
  }

  // Create executor factory that supports .with(bindGroup) pattern
  function createExecutorBase(
    additionalBindGroups: TgpuBindGroup[] = [],
  ): RadianceCascadesExecutorBase {
    function run() {
      // Run cascade passes top-down
      for (let layer = cascadeAmount - 1; layer >= 0; layer--) {
        paramsBuffer.write({
          layer,
          baseProbes: d.vec2u(cascadeProbesX, cascadeProbesY),
          cascadeDim: d.vec2u(cascadeDimX, cascadeDimY),
          cascadeCount: cascadeAmount,
        });

        const bindGroup = cascadePassBindGroups[layer];
        if (bindGroup) {
          let pipeline = cascadePassPipeline.with(bindGroup);
          for (const bg of additionalBindGroups) {
            pipeline = pipeline.with(bg);
          }
          pipeline.dispatchWorkgroups(cascadeWorkgroupsX, cascadeWorkgroupsY);
        }
      }

      // Build the final radiance field
      let radiancePipeline = buildRadianceFieldPipeline.with(
        buildRadianceFieldBG,
      );
      for (const bg of additionalBindGroups) {
        radiancePipeline = radiancePipeline.with(bg);
      }
      radiancePipeline.dispatchWorkgroups(outputWorkgroupsX, outputWorkgroupsY);
    }

    function withBindGroup(
      bindGroup: TgpuBindGroup,
    ): RadianceCascadesExecutorBase {
      return createExecutorBase([...additionalBindGroups, bindGroup]);
    }

    return { run, with: withBindGroup, destroy };
  }

  function createExecutorWithOutput(
    additionalBindGroups: TgpuBindGroup[] = [],
  ): RadianceCascadesExecutor {
    const base = createExecutorBase(additionalBindGroups);

    function withBindGroup(bindGroup: TgpuBindGroup): RadianceCascadesExecutor {
      return createExecutorWithOutput([...additionalBindGroups, bindGroup]);
    }

    return {
      ...base,
      with: withBindGroup,
      output: ownedOutput as OwnedOutputTexture,
    };
  }

  if (hasOutputProvided) {
    return createExecutorBase();
  }

  return createExecutorWithOutput();
}
