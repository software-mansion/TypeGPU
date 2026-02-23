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
  cascadePassBGL,
  cascadePassCompute,
  CascadeStaticParams,
  colorSlot,
  defaultRayMarch,
  getCascadeDim,
  type RayMarchResult,
  rayMarchSlot,
  sdfResolutionSlot,
  sdfSlot,
} from './cascades.ts';

type OutputTexture =
  | (
    & TgpuTexture<{ size: [number, number]; format: 'rgba16float' }>
    & StorageFlag
  )
  | TgpuTextureView<d.WgslStorageTexture2d<'rgba16float', 'write-only'>>;

type CascadesOptions = {
  root: TgpuRoot;
  sdf: (uv: d.v2f) => number;
  color: (uv: d.v2f) => d.v3f;
  sdfResolution: { width: number; height: number };
  rayMarch?: (
    probePos: d.v2f,
    rayDir: d.v2f,
    startT: number,
    endT: number,
    eps: number,
    minStep: number,
    bias: number,
  ) => d.Infer<typeof RayMarchResult>;
  output?: OutputTexture;
  size?: { width: number; height: number };
};

type OutputTextureProp =
  & TgpuTexture<{
    size: [number, number];
    format: 'rgba16float';
  }>
  & StorageFlag
  & SampledFlag;

export type RadianceCascadesExecutor = {
  run(): void;
  with(bindGroup: TgpuBindGroup): RadianceCascadesExecutor;
  destroy(): void;
  readonly output: OutputTextureProp;
};

export function createRadianceCascades(
  options: CascadesOptions,
): RadianceCascadesExecutor {
  const { root, sdf, color, sdfResolution, output, size, rayMarch } = options;

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

  // Create or use provided output texture
  const dst = hasOutputProvided ? output : root['~unstable']
    .createTexture({
      size: [outputWidth, outputHeight],
      format: 'rgba16float',
    })
    .$usage('storage', 'sampled');

  const ownsOutput = !hasOutputProvided;

  const [cascadeDimX, cascadeDimY, cascadeAmount] = getCascadeDim(
    outputWidth,
    outputHeight,
  );

  const cascadeProbesX = cascadeDimX / 2;
  const cascadeProbesY = cascadeDimY / 2;

  console.debug('[radiance-cascades] config:', {
    output: `${outputWidth}x${outputHeight}`,
    cascadeDim: `${cascadeDimX}x${cascadeDimY}`,
    probes: `${cascadeProbesX}x${cascadeProbesY}`,
    cascadeCount: cascadeAmount,
    sdfResolution: `${sdfResolution.width}x${sdfResolution.height}`,
    textureMemory: `${
      ((cascadeDimX * cascadeDimY * cascadeAmount * 8 * 2) / (1024 * 1024))
        .toFixed(1)
    } MB (2x cascade textures)`,
    dispatchesPerRun: `${cascadeAmount} cascade + 1 build = ${
      cascadeAmount + 1
    }`,
    workgroupsPerCascadeDispatch: `${Math.ceil(cascadeDimX / 8)}x${
      Math.ceil(cascadeDimY / 8)
    } = ${Math.ceil(cascadeDimX / 8) * Math.ceil(cascadeDimY / 8)}`,
    workgroupsPerBuildDispatch: `${Math.ceil(outputWidth / 8)}x${
      Math.ceil(outputHeight / 8)
    } = ${Math.ceil(outputWidth / 8) * Math.ceil(outputHeight / 8)}`,
  });

  // Log per-layer probe/ray breakdown
  for (let l = 0; l < cascadeAmount; l++) {
    const probesX = Math.max(cascadeProbesX >> l, 1);
    const probesY = Math.max(cascadeProbesY >> l, 1);
    const raysDimStored = 2 << l;
    const raysDimActual = raysDimStored * 2;
    const usedX = probesX * raysDimStored;
    const usedY = probesY * raysDimStored;
    console.debug(
      `  layer ${l}: probes=${probesX}x${probesY}, rays=${raysDimActual}x${raysDimActual} (stored ${raysDimStored}x${raysDimStored}), used=${usedX}x${usedY} of ${cascadeDimX}x${cascadeDimY} (${
        ((usedX * usedY) / (cascadeDimX * cascadeDimY) * 100).toFixed(0)
      }%)`,
    );
  }

  const cascadeTextureA = root['~unstable']
    .createTexture({
      size: [cascadeDimX, cascadeDimY, cascadeAmount],
      format: 'rgba16float',
    })
    .$usage('storage', 'sampled');

  const cascadeTextureB = root['~unstable']
    .createTexture({
      size: [cascadeDimX, cascadeDimY, cascadeAmount],
      format: 'rgba16float',
    })
    .$usage('storage', 'sampled');

  const cascadeSampler = root['~unstable'].createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const staticParamsBuffer = root
    .createBuffer(CascadeStaticParams, {
      baseProbes: d.vec2u(cascadeProbesX, cascadeProbesY),
      cascadeDim: d.vec2u(cascadeDimX, cascadeDimY),
      cascadeCount: cascadeAmount,
    })
    .$usage('uniform');

  const layerBuffer = root.createBuffer(d.u32).$usage('uniform');

  const cascadePassPipeline = root['~unstable']
    .with(sdfResolutionSlot, d.vec2u(sdfResolution.width, sdfResolution.height))
    .with(sdfSlot, sdf)
    .with(colorSlot, color)
    .with(rayMarchSlot, rayMarch ?? defaultRayMarch)
    .withCompute(cascadePassCompute)
    .createPipeline();

  const cascadePassBindGroups = Array.from(
    { length: cascadeAmount },
    (_, layer) => {
      const writeToA = (cascadeAmount - 1 - layer) % 2 === 0;
      const dstTexture = writeToA ? cascadeTextureA : cascadeTextureB;
      const srcTexture = writeToA ? cascadeTextureB : cascadeTextureA;

      return root.createBindGroup(cascadePassBGL, {
        staticParams: staticParamsBuffer,
        layer: layerBuffer,
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

  const buildRadianceFieldPipeline = root['~unstable']
    .withCompute(buildRadianceFieldCompute)
    .createPipeline();

  const radianceFieldParamsBuffer = root
    .createBuffer(BuildRadianceFieldParams, {
      outputProbes: d.vec2u(outputWidth, outputHeight),
      cascadeProbes: d.vec2u(cascadeProbesX, cascadeProbesY),
    })
    .$usage('uniform');

  const cascade0InA = (cascadeAmount - 1) % 2 === 0;
  const srcCascadeTexture = cascade0InA ? cascadeTextureA : cascadeTextureB;

  const dstView = isTexture(dst)
    ? (
      dst as
        & TgpuTexture<{ size: [number, number]; format: 'rgba16float' }>
        & StorageFlag
    ).createView(d.textureStorage2d('rgba16float', 'write-only'))
    : dst;

  const buildRadianceFieldBG = root.createBindGroup(buildRadianceFieldBGL, {
    params: radianceFieldParamsBuffer,
    src: srcCascadeTexture.createView(d.texture2d(d.f32), {
      baseArrayLayer: 0,
      arrayLayerCount: 1,
    }),
    srcSampler: cascadeSampler,
    dst: dstView,
  });

  const cascadeWorkgroupsX = Math.ceil(cascadeDimX / 8);
  const cascadeWorkgroupsY = Math.ceil(cascadeDimY / 8);
  const outputWorkgroupsX = Math.ceil(outputWidth / 8);
  const outputWorkgroupsY = Math.ceil(outputHeight / 8);

  function destroy() {
    cascadeTextureA.destroy();
    cascadeTextureB.destroy();
    if (ownsOutput && isTexture(dst)) {
      dst.destroy();
    }
  }

  function createExecutor(
    additionalBindGroups: TgpuBindGroup[] = [],
  ): RadianceCascadesExecutor {
    const prebuiltCascadePipelines = cascadePassBindGroups.map((bg) => {
      let p = cascadePassPipeline.with(bg);
      for (const addBg of additionalBindGroups) {
        p = p.with(addBg);
      }
      return p;
    });

    let prebuiltRadiancePipeline = buildRadianceFieldPipeline.with(
      buildRadianceFieldBG,
    );
    for (const bg of additionalBindGroups) {
      prebuiltRadiancePipeline = prebuiltRadiancePipeline.with(bg);
    }

    function run() {
      for (let layer = cascadeAmount - 1; layer >= 0; layer--) {
        layerBuffer.write(layer);
        prebuiltCascadePipelines[layer]?.dispatchWorkgroups(
          cascadeWorkgroupsX,
          cascadeWorkgroupsY,
        );
      }

      prebuiltRadiancePipeline.dispatchWorkgroups(
        outputWorkgroupsX,
        outputWorkgroupsY,
      );
    }

    return {
      run,
      with: (bg) => createExecutor([...additionalBindGroups, bg]),
      destroy,
      output: dst as OutputTextureProp,
    };
  }

  return createExecutor();
}
