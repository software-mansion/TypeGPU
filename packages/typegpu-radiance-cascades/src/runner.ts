import {
  isTexture,
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

type OutputTexture = TgpuTexture<{
  size: [number, number];
  format: 'rgba16float';
}> &
  StorageFlag &
  SampledFlag;
type OutputTextureView = TgpuTextureView<d.WgslStorageTexture2d<'rgba16float', 'write-only'>>;
type OutputResource = OutputTexture | OutputTextureView;
type Size = { width: number; height: number };

type CascadesOptions<TOutput extends OutputResource | undefined = OutputResource | undefined> = {
  root: TgpuRoot;
  sdf: (uv: d.v2f) => number;
  color: (uv: d.v2f) => d.v3f;
  sdfResolution: Size;
  rayMarch?: (
    probePos: d.v2f,
    rayDir: d.v2f,
    startT: number,
    endT: number,
    eps: number,
    minStep: number,
    bias: number,
  ) => d.InferGPU<typeof RayMarchResult>;
  output?: TOutput;
  size?: Size;
};

export type RadianceCascadesExecutor<TOutput extends OutputResource = OutputTexture> = {
  run(): void;
  with(bindGroup: TgpuBindGroup): RadianceCascadesExecutor<TOutput>;
  destroy(): void;
  readonly output: TOutput;
};

export function createRadianceCascades(
  options: CascadesOptions<undefined> & { size: Size },
): RadianceCascadesExecutor<OutputTexture>;
export function createRadianceCascades<TOutput extends OutputResource>(
  options: CascadesOptions<TOutput> & { output: TOutput },
): RadianceCascadesExecutor<TOutput>;
export function createRadianceCascades(
  options: CascadesOptions,
): RadianceCascadesExecutor<OutputResource> {
  const { root, sdf, color, sdfResolution, output, size, rayMarch } = options;

  const outputSize = output
    ? isTexture(output)
      ? output.props.size
      : (output.size ?? (size && [size.width, size.height]))
    : size && [size.width, size.height];
  const outputWidth = outputSize?.[0];
  const outputHeight = outputSize?.[1];
  if (!outputWidth || !outputHeight) {
    throw new Error('Size could not be inferred from output, pass explicit size in options.');
  }

  const dst: OutputResource =
    output ??
    root
      .createTexture({
        size: [outputWidth, outputHeight],
        format: 'rgba16float',
      })
      .$usage('storage', 'sampled');

  const [cascadeDimX, cascadeDimY, cascadeAmount] = getCascadeDim(outputWidth, outputHeight);

  const cascadeProbesX = cascadeDimX / 2;
  const cascadeProbesY = cascadeDimY / 2;

  const cascadeTextureA = root
    .createTexture({
      size: [cascadeDimX, cascadeDimY, cascadeAmount],
      format: 'rgba16float',
    })
    .$usage('storage', 'sampled');

  const cascadeTextureB = root
    .createTexture({
      size: [cascadeDimX, cascadeDimY, cascadeAmount],
      format: 'rgba16float',
    })
    .$usage('storage', 'sampled');

  const cascadeSampler = root.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const staticParamsBuffer = root
    .createBuffer(CascadeStaticParams, {
      baseProbes: [cascadeProbesX, cascadeProbesY],
      cascadeDim: [cascadeDimX, cascadeDimY],
      cascadeCount: cascadeAmount,
    })
    .$usage('uniform');

  const layerBuffer = root.createBuffer(d.u32).$usage('uniform');

  const cascadePassPipeline = root
    .with(sdfResolutionSlot, d.vec2u(sdfResolution.width, sdfResolution.height))
    .with(sdfSlot, sdf)
    .with(colorSlot, color)
    .with(rayMarchSlot, rayMarch ?? defaultRayMarch)
    .createComputePipeline({ compute: cascadePassCompute });

  const cascadePassBindGroups = Array.from({ length: cascadeAmount }, (_, layer) => {
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
      dst: dstTexture.createView(d.textureStorage2d('rgba16float'), {
        baseArrayLayer: layer,
        arrayLayerCount: 1,
      }),
    });
  });

  const buildRadianceFieldPipeline = root.createComputePipeline({
    compute: buildRadianceFieldCompute,
  });

  const radianceFieldParamsBuffer = root
    .createBuffer(BuildRadianceFieldParams, {
      outputProbes: [outputWidth, outputHeight],
      cascadeProbes: [cascadeProbesX, cascadeProbesY],
    })
    .$usage('uniform');

  const cascade0InA = (cascadeAmount - 1) % 2 === 0;
  const srcCascadeTexture = cascade0InA ? cascadeTextureA : cascadeTextureB;

  const buildRadianceFieldBG = root.createBindGroup(buildRadianceFieldBGL, {
    params: radianceFieldParamsBuffer,
    src: srcCascadeTexture.createView(d.texture2d(d.f32), {
      baseArrayLayer: 0,
      arrayLayerCount: 1,
    }),
    srcSampler: cascadeSampler,
    dst,
  });

  const cascadeWorkgroupsX = Math.ceil(cascadeDimX / 8);
  const cascadeWorkgroupsY = Math.ceil(cascadeDimY / 8);
  const outputWorkgroupsX = Math.ceil(outputWidth / 8);
  const outputWorkgroupsY = Math.ceil(outputHeight / 8);

  function destroy() {
    cascadeTextureA.destroy();
    cascadeTextureB.destroy();
    if (!output && isTexture(dst)) {
      dst.destroy();
    }
  }

  function createExecutor(
    additionalBindGroups: TgpuBindGroup[] = [],
  ): RadianceCascadesExecutor<OutputResource> {
    const prebuiltCascadePipelines = cascadePassBindGroups.map((bg) => {
      let p = cascadePassPipeline.with(bg);
      for (const addBg of additionalBindGroups) {
        p = p.with(addBg);
      }
      return p;
    });

    let prebuiltRadiancePipeline = buildRadianceFieldPipeline.with(buildRadianceFieldBG);
    for (const bg of additionalBindGroups) {
      prebuiltRadiancePipeline = prebuiltRadiancePipeline.with(bg);
    }

    function run() {
      for (let layer = cascadeAmount - 1; layer >= 0; layer--) {
        layerBuffer.write(layer);
        prebuiltCascadePipelines[layer]?.dispatchWorkgroups(cascadeWorkgroupsX, cascadeWorkgroupsY);
      }

      prebuiltRadiancePipeline.dispatchWorkgroups(outputWorkgroupsX, outputWorkgroupsY);
    }

    return {
      run,
      with: (bg) => createExecutor([...additionalBindGroups, bg]),
      destroy,
      output: dst,
    };
  }

  return createExecutor();
}
