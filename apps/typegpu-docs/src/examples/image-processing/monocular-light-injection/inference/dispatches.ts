import { d } from 'typegpu';
import type { TgpuComputePipeline, TgpuRoot } from 'typegpu';
import {
  BinaryBroadcastCode,
  ChannelAffineUniforms,
  ChannelViewUniforms,
  CONV_CONVERT_FP32_WEIGHTS,
  Conv2dUniforms,
  CrossScanUniforms,
  DEPTH_WIDE_WORKGROUP_SIZE,
  DepthwiseConvUniforms,
  ElementwiseUniforms,
  LayerNormUniforms,
  PoolUniforms,
  ResizeUniforms,
  ScanProjectUniforms,
  SelectiveScanUniforms,
  WinogradF2Uniforms,
  activationSlot,
  averagePoolKernel,
  bilinearAlignCornersResizeKernel,
  bilinearHalfPixelResizeKernel,
  binaryLayout,
  channelAffineKernel,
  channelAffineLayout,
  channelConcatKernel,
  channelConcatLayout,
  channelSplitKernel,
  channelSplitLayout,
  conv1x1Kernel,
  createSpecializedLayerNormKernel,
  createSpecializedScanProjectKernel,
  CROSS_SCAN_DIRECTION_COUNT,
  createSpecializedWinogradGemmKernel,
  conv2dLayout,
  conv3x3Kernel,
  crossMergeKernel,
  crossMergeLayout,
  depthwise3x3Kernel,
  depthwiseConvLayout,
  depthwiseHorizontalAxisKernel,
  depthwiseVerticalAxisKernel,
  geluExact,
  identityActivation,
  type LayerNormShape,
  layerNormLayout,
  layerNormShapeKey,
  layerNormWorkgroups,
  nativeF16Conv1x1Kernel,
  nativeF16Conv2dLayout,
  nativeF16Conv3x3Kernel,
  nativeF16Depthwise3x3Kernel,
  nativeF16DepthwiseConvLayout,
  nativeF16DepthwiseHorizontalAxisKernel,
  nativeF16DepthwiseVerticalAxisKernel,
  nativeF16DestinationIsF16Slot,
  nativeF16SourceIsF16Slot,
  nearestAsymmetricResizeKernel,
  packedF16Depthwise3x3Kernel,
  packedF16DepthwiseConvLayout,
  packedF16DepthwiseHorizontalAxisKernel,
  packedF16DepthwiseVerticalAxisKernel,
  pointwiseShapeKey,
  pointwiseSpecializedWorkgroups,
  pointwiseTileFor,
  addCombine,
  createBinaryKernel,
  createConv3x3SpecializedKernel,
  createUnaryKernel,
  elementwiseShapeKey,
  multiplyCombine,
  negated,
  subtractCombine,
  type ElementwiseShape,
  createNativeF16Conv3x3SpecializedKernel,
  createNativeF16SpecializedConv1x1Kernel,
  createSpecializedConv1x1Kernel,
  spatialShapeKey,
  spatialSpecializedWorkgroups,
  spatialTileFor,
  type SpatialShape,
  type PointwiseShape,
  poolLayout,
  relu,
  resizeLayout,
  scanProjectLayout,
  type ScanProjectShape,
  scanProjectShapeKey,
  sequentialSelectiveScanKernel,
  selectiveScanLayout,
  silu,
  unaryLayout,
  winogradF2DestinationIsF16Slot,
  winogradF2GemmF16Kernel,
  winogradF2GemmF32Kernel,
  winogradF2GemmLayout,
  winogradF2InputLayout,
  winogradF2OutputLayout,
  winogradF2SourceIsF16Slot,
  winogradF2TransformedInputIsF16Slot,
  winogradF4InputTransformKernel,
  winogradF4OutputTransformKernel,
  WINOGRAD_F2_F16_OUTPUT_BLOCK_TILE,
  WINOGRAD_F2_F16_TILE_TILE,
  WINOGRAD_F2_F32_OUTPUT_BLOCK_TILE,
  WINOGRAD_F2_F32_TILE_TILE,
  WINOGRAD_F4_COEFFICIENTS,
  type WinogradGemmShape,
  winogradGemmShapeKey,
  winogradGemmSpecializedWorkgroups,
  winogradGemmTileFor,
  WINOGRAD_F4_PAIRS_PER_WORKGROUP,
  MAX_COMPUTE_WORKGROUPS_PER_DIMENSION,
  MAX_SELECTIVE_SCAN_RANK,
  type Vec4Activation,
} from './kernels/index.ts';
import type { OwnedGpuResource, PreparedDispatch } from './execution-plan.ts';
import {
  createPreparedRawBindGroup,
  storageBindingFor,
  type ImmutableWeightStorage,
  type PackedWeightBuffer,
  type WeightTranspose,
} from './gpu-resources.ts';
import { convertWeightToHalf } from './half-weights.ts';
import { DepthTensorArena } from './tensor-arena.ts';
import {
  DepthActivation,
  DepthBinaryKind,
  DepthBroadcast,
  DepthDType,
  DepthOutputPolarity,
  DepthPrecision,
  DepthResizeCoordinateMode,
  DepthResizeMode,
  DepthTensorLayout,
  type DepthBundle,
  type DepthDispatch,
  type DepthTensor,
  type DepthWeightSection,
} from './types.ts';
import { transformWinogradF4Weight } from './winograd-f2-weight.ts';

export interface PreparedDepthDispatches {
  readonly dispatches: readonly PreparedDispatch[];
  readonly ownedResources: readonly OwnedGpuResource[];
  readonly additionalWeightBytes: number;
  readonly additionalActivationBytes: number;
}

interface Hwc4Shape {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly channelBlocks: number;
  readonly elementCount: number;
}

interface PlainHwc4Shape extends Hwc4Shape {
  readonly dtype: typeof DepthDType.F32 | typeof DepthDType.F16;
}

interface WinogradConfig {
  readonly input: PlainHwc4Shape;
  readonly output: PlainHwc4Shape;
  readonly nativeF16: boolean;
  readonly coefficients: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly tileCount: number;
  readonly inputBytes: number;
  readonly outputBytes: number;
}

type PipelineFactory = () => TgpuComputePipeline;

const WINOGRAD_MINIMUM_OUTPUT_CHANNELS = 64;
const WINOGRAD_FP16_MINIMUM_OUTPUT_CHANNELS = 48;

function dispatchTensor(
  bundle: DepthBundle,
  dispatch: DepthDispatch,
  side: 'inputs' | 'outputs',
  index: number,
): DepthTensor {
  const tensorId = dispatch[side][index];
  const tensor = tensorId === undefined ? undefined : bundle.tensorById.get(tensorId);
  if (tensor === undefined) {
    throw new Error(`Dispatch '${dispatch.id}' is missing ${side}[${index}].`);
  }
  return tensor;
}

function plainHwc4Shape(tensor: DepthTensor): PlainHwc4Shape {
  if (tensor.layout !== DepthTensorLayout.Hwc4) {
    throw new Error(`Tensor '${tensor.id}' is not an HWC4 activation.`);
  }
  const [, channels = 0, height = 0, width = 0] = tensor.shape;
  const channelBlocks = Math.ceil(channels / 4);
  return {
    width,
    height,
    channels,
    channelBlocks,
    elementCount: width * height * channelBlocks,
    dtype: tensor.dtype,
  };
}

function hwc4Shape(tensor: DepthTensor): Hwc4Shape {
  const shape = plainHwc4Shape(tensor);
  if (shape.dtype !== DepthDType.F32) {
    throw new Error(`Tensor '${tensor.id}' is not an FP32 HWC4 activation.`);
  }
  return shape;
}

function usesNativeF16(tensor: DepthTensor): boolean {
  return tensor.dtype === DepthDType.F16;
}

function sectionFor(bundle: DepthBundle, tensor: DepthTensor): DepthWeightSection {
  const section =
    tensor.storage.kind === 'section'
      ? bundle.weightSectionById.get(tensor.storage.sectionId)
      : undefined;
  if (section === undefined) {
    throw new Error(`Tensor '${tensor.id}' is not stored in a weight section.`);
  }
  return section;
}

function sectionBinding(
  bundle: DepthBundle,
  weights: ImmutableWeightStorage,
  tensor: DepthTensor,
): GPUBufferBinding {
  const section = sectionFor(bundle, tensor);
  return storageBindingFor(weights, section.byteOffset, section.byteLength);
}

function sectionByteOffset(tensor: DepthTensor): number {
  return tensor.storage.kind === 'section' ? tensor.storage.byteOffset : 0;
}

function vec4Base(tensor: DepthTensor): number {
  return sectionByteOffset(tensor) / 16;
}

function scalarBase(tensor: DepthTensor): number {
  return sectionByteOffset(tensor) / 4;
}

function rawArenaBinding(arena: DepthTensorArena, tensor: DepthTensor): GPUBufferBinding {
  return { buffer: arena.rawBufferFor(tensor.id) };
}

function splitWorkgroups(count: number): { readonly x: number; readonly y: number } {
  return {
    x: Math.min(count, MAX_COMPUTE_WORKGROUPS_PER_DIMENSION),
    y: Math.ceil(count / MAX_COMPUTE_WORKGROUPS_PER_DIMENSION),
  };
}

function winogradConfig(bundle: DepthBundle, record: DepthDispatch): WinogradConfig | undefined {
  if (
    record.op !== 'conv2d' ||
    record.params.kernel[0] !== 3 ||
    record.params.kernel[1] !== 3 ||
    record.params.stride[0] !== 1 ||
    record.params.stride[1] !== 1 ||
    record.params.padding.some((value) => value !== 1) ||
    record.params.groups !== 1
  ) {
    return undefined;
  }
  const src = dispatchTensor(bundle, record, 'inputs', 0);
  const weight = dispatchTensor(bundle, record, 'inputs', 1);
  const dst = dispatchTensor(bundle, record, 'outputs', 0);
  const input = plainHwc4Shape(src);
  const output = plainHwc4Shape(dst);
  const minimumOutputChannels =
    bundle.precision === DepthPrecision.Fp16Native
      ? WINOGRAD_FP16_MINIMUM_OUTPUT_CHANNELS
      : WINOGRAD_MINIMUM_OUTPUT_CHANNELS;
  if (
    output.channels < minimumOutputChannels ||
    input.width !== output.width ||
    input.height !== output.height
  ) {
    return undefined;
  }
  const nativeF16 = weight.dtype === DepthDType.F16;
  if (nativeF16 && input.dtype === DepthDType.F32 && output.dtype === DepthDType.F32) {
    return undefined;
  }
  const tilesX = Math.ceil(output.width / 4);
  const tilesY = Math.ceil(output.height / 4);
  const tileCount = tilesX * tilesY;
  const inputBytes =
    WINOGRAD_F4_COEFFICIENTS * tileCount * input.channelBlocks * (nativeF16 ? 8 : 16);
  const outputBytes = WINOGRAD_F4_COEFFICIENTS * tileCount * output.channelBlocks * 16;
  return {
    input,
    output,
    nativeF16,
    coefficients: WINOGRAD_F4_COEFFICIENTS,
    tilesX,
    tilesY,
    tileCount,
    inputBytes,
    outputBytes,
  };
}

export function winogradConvDispatches(bundle: DepthBundle): readonly string[] {
  return bundle.dispatches
    .filter((record) => winogradConfig(bundle, record) !== undefined)
    .map((record) => record.id);
}

/**
 * Whether a convolution's FP32 bundle weights are converted to FP16 at load so
 * the dispatch can take the native kernel. Winograd keeps its own FP32 filter
 * transform, so convolutions it claims are excluded.
 *
 * Only a bundle that already asked for half precision is eligible. The
 * `f32-reference` profile exists to be a ground truth, and converting its
 * weights would quietly make it something else.
 */
function convertsWeightToHalf(bundle: DepthBundle, record: DepthDispatch): boolean {
  if (
    !CONV_CONVERT_FP32_WEIGHTS ||
    bundle.precision !== DepthPrecision.Fp16Native ||
    record.op !== 'conv2d'
  ) {
    return false;
  }
  const weight = dispatchTensor(bundle, record, 'inputs', 1);
  return (
    weight.dtype === DepthDType.F32 &&
    weight.layout === DepthTensorLayout.O4I4Yx &&
    winogradConfig(bundle, record) === undefined
  );
}

/** The convolutions whose FP32 weights are uploaded as FP16 in their own buffer. */
export function halfConvertedConvWeights(bundle: DepthBundle): readonly string[] {
  return bundle.dispatches
    .filter((record) => convertsWeightToHalf(bundle, record))
    .map((record) => record.id);
}

/**
 * Whether a dispatch takes the outer-product 1x1 kernel, which reads its weights
 * as I4/O4. `outerProductPointwiseWeights` transposes exactly this set before
 * upload and `createDepthDispatches` fails if the two ever disagree, so the two
 * weight packings in the arena can never be confused for one another.
 */
function usesOuterProductPointwise(bundle: DepthBundle, record: DepthDispatch): boolean {
  if (
    record.op !== 'conv2d' ||
    record.params.kernel[0] !== 1 ||
    record.params.kernel[1] !== 1 ||
    record.params.groups !== 1
  ) {
    return false;
  }
  const weight = dispatchTensor(bundle, record, 'inputs', 1);
  if (!usesNativeF16(weight)) {
    return false;
  }
  const input = plainHwc4Shape(dispatchTensor(bundle, record, 'inputs', 0));
  const output = plainHwc4Shape(dispatchTensor(bundle, record, 'outputs', 0));
  const [strideY, strideX] = record.params.stride;
  if (
    strideX !== 1 ||
    strideY !== 1 ||
    input.width !== output.width ||
    input.height !== output.height
  ) {
    return false;
  }
  const shape: PointwiseShape = {
    inputChannelBlocks: input.channelBlocks,
    outputChannelBlocks: output.channelBlocks,
    pixelCount: output.width * output.height,
    logicalOutputChannels: output.channels,
  };
  return (
    pointwiseSpecializedWorkgroups(shape) !== undefined && pointwiseTileFor(shape) !== undefined
  );
}

/**
 * Weight tensors to upload with their lane pair transposed. Every 1x1 weight
 * tensor in a bundle is referenced by exactly one dispatch and shares no byte
 * range with another tensor, so transposing a subset of them is safe.
 */
export function outerProductPointwiseWeights(bundle: DepthBundle): readonly WeightTranspose[] {
  const transposes: WeightTranspose[] = [];
  for (const record of bundle.dispatches) {
    if (!usesOuterProductPointwise(bundle, record)) {
      continue;
    }
    const weight = dispatchTensor(bundle, record, 'inputs', 1);
    const section = sectionFor(bundle, weight);
    transposes.push({
      tensorId: weight.id,
      byteOffset: section.byteOffset + vec4Base(weight) * 16,
      byteLength: weight.byteLength,
      elementBytes: weight.dtype === DepthDType.F16 ? 2 : 4,
    });
  }
  return transposes;
}

function assertTransposedWeightsMatchRouting(
  weights: ImmutableWeightStorage,
  routed: ReadonlySet<string>,
): void {
  const uploaded = weights.transposedWeights;
  const missing = [...routed].filter((id) => !uploaded.has(id));
  const extra = [...uploaded].filter((id) => !routed.has(id));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Outer-product 1x1 routing disagrees with the uploaded weight packing; ` +
        `not transposed: [${missing.join(', ')}], transposed but unused: [${extra.join(', ')}].`,
    );
  }
}

function activationFunction(activation: DepthActivation): Vec4Activation {
  switch (activation) {
    case DepthActivation.None:
      return identityActivation;
    case DepthActivation.Gelu:
      return geluExact;
    case DepthActivation.Silu:
      return silu;
    case DepthActivation.Relu:
      return relu;
  }
}

function binaryBroadcastCode(broadcast: DepthBroadcast): number {
  switch (broadcast) {
    case DepthBroadcast.None:
      return BinaryBroadcastCode.None;
    case DepthBroadcast.Scalar:
      return BinaryBroadcastCode.Scalar;
    case DepthBroadcast.Channels:
      return BinaryBroadcastCode.Channels;
    case DepthBroadcast.Spatial:
      return BinaryBroadcastCode.Spatial;
  }
}

export function createDepthDispatches(
  root: TgpuRoot,
  bundle: DepthBundle,
  arena: DepthTensorArena,
  weights: ImmutableWeightStorage,
): PreparedDepthDispatches {
  const dispatches: PreparedDispatch[] = [];
  const ownedResources: OwnedGpuResource[] = [];
  const pipelines = new Map<string, TgpuComputePipeline>();
  let additionalWeightBytes = 0;
  let outputPolarityApplied = bundle.output.polarity === DepthOutputPolarity.Direct;

  const pipelineFor = (key: string, create: PipelineFactory): TgpuComputePipeline => {
    let pipeline = pipelines.get(key);
    if (!pipeline) {
      pipeline = create().$name(`DepthART ${key}`);
      pipelines.set(key, pipeline);
    }
    return pipeline;
  };

  const own = <T extends OwnedGpuResource>(resource: T): T => {
    ownedResources.push(resource);
    return resource;
  };

  const outerProductWeights = new Set<string>();
  const winogradConfigs = new Map<string, WinogradConfig>();
  let maximumWinogradInputBytes = 0;
  let maximumWinogradOutputBytes = 0;
  for (const record of bundle.dispatches) {
    const config = winogradConfig(bundle, record);
    if (config !== undefined) {
      winogradConfigs.set(record.id, config);
      maximumWinogradInputBytes = Math.max(maximumWinogradInputBytes, config.inputBytes);
      maximumWinogradOutputBytes = Math.max(maximumWinogradOutputBytes, config.outputBytes);
    }
  }
  const winogradInputScratch =
    maximumWinogradInputBytes === 0
      ? undefined
      : own(
          root
            .createBuffer(d.arrayOf(d.u32, maximumWinogradInputBytes / 4))
            .$usage('storage')
            .$name('DepthART shared Winograd F2 input scratch'),
        );
  const winogradOutputScratch =
    maximumWinogradOutputBytes === 0
      ? undefined
      : own(
          root
            .createBuffer(d.arrayOf(d.u32, maximumWinogradOutputBytes / 4))
            .$usage('storage')
            .$name('DepthART shared Winograd F2 output scratch'),
        );

  try {
    for (const record of bundle.dispatches) {
      switch (record.op) {
        case 'conv2d':
        case 'depthwise-conv2d': {
          const src = dispatchTensor(bundle, record, 'inputs', 0);
          const weight = dispatchTensor(bundle, record, 'inputs', 1);
          const bias = dispatchTensor(bundle, record, 'inputs', 2);
          const dst = dispatchTensor(bundle, record, 'outputs', 0);
          const inputShape = plainHwc4Shape(src);
          const outputShape = plainHwc4Shape(dst);
          const [kernelHeight, kernelWidth] = record.params.kernel;
          const [strideY, strideX] = record.params.stride;
          const [padTop, padLeft, padBottom, padRight] = record.params.padding;
          if (padTop !== padBottom || padLeft !== padRight) {
            throw new Error(
              `Dispatch '${record.id}' requires unsupported asymmetric convolution padding.`,
            );
          }
          const invertsOutput =
            bundle.output.polarity === DepthOutputPolarity.Inverted &&
            dst.id === bundle.output.tensorId;
          if (invertsOutput) {
            outputPolarityApplied = true;
          }
          const activation = invertsOutput
            ? negated(activationFunction(record.params.activation))
            : activationFunction(record.params.activation);
          const activationKey = `${record.params.activation}${invertsOutput ? '-inverted-output' : ''}`;
          if (record.op === 'conv2d') {
            const convertsToHalf = convertsWeightToHalf(bundle, record);
            const nativeF16 = usesNativeF16(weight) || convertsToHalf;
            if (
              !nativeF16 &&
              (inputShape.dtype !== DepthDType.F32 || outputShape.dtype !== DepthDType.F32)
            ) {
              throw new Error(
                `Dispatch '${record.id}' requires FP32 activations unless it uses native FP16 weights.`,
              );
            }
            /** Every 1x1 in this model is stride 1 with matching spatial extents. */
            const pointwiseShape: PointwiseShape | undefined =
              kernelHeight === 1 &&
              kernelWidth === 1 &&
              strideX === 1 &&
              strideY === 1 &&
              inputShape.width === outputShape.width &&
              inputShape.height === outputShape.height
                ? {
                    inputChannelBlocks: inputShape.channelBlocks,
                    outputChannelBlocks: outputShape.channelBlocks,
                    pixelCount: outputShape.width * outputShape.height,
                    logicalOutputChannels: outputShape.channels,
                  }
                : undefined;
            const pointwiseTile = pointwiseShape ? pointwiseTileFor(pointwiseShape) : undefined;
            const specializedPointwiseWorkgroups = pointwiseShape
              ? pointwiseSpecializedWorkgroups(pointwiseShape)
              : undefined;
            /** Winograd claims its eligible dispatches earlier, so this sees only direct 3x3. */
            const spatialShape: SpatialShape | undefined =
              kernelHeight === 3 && kernelWidth === 3
                ? {
                    inputChannelBlocks: inputShape.channelBlocks,
                    outputChannelBlocks: outputShape.channelBlocks,
                    inputWidth: inputShape.width,
                    inputHeight: inputShape.height,
                    outputWidth: outputShape.width,
                    outputHeight: outputShape.height,
                    strideX,
                    strideY,
                    padX: padLeft,
                    padY: padTop,
                    logicalOutputChannels: outputShape.channels,
                  }
                : undefined;
            const spatialTile = spatialShape ? spatialTileFor(spatialShape) : undefined;
            const specializedSpatialWorkgroups = spatialShape
              ? spatialSpecializedWorkgroups(spatialShape)
              : undefined;
            const compute =
              kernelHeight === 1 && kernelWidth === 1
                ? conv1x1Kernel
                : kernelHeight === 3 && kernelWidth === 3
                  ? conv3x3Kernel
                  : undefined;
            if (!compute || record.params.groups !== 1) {
              throw new Error(`Dispatch '${record.id}' uses an unsupported regular convolution.`);
            }
            if (kernelHeight === 1 && (padTop !== 0 || padLeft !== 0)) {
              throw new Error(
                `Dispatch '${record.id}' uses unsupported padding on a 1x1 convolution.`,
              );
            }
            const winograd = winogradConfigs.get(record.id);
            if (winograd !== undefined) {
              if (winogradInputScratch === undefined || winogradOutputScratch === undefined) {
                throw new Error(`Dispatch '${record.id}' is missing shared Winograd scratch.`);
              }
              const transformed = transformWinogradF4Weight(
                bundle,
                weight,
                outputShape.channels,
                inputShape.channels,
              );
              if (transformed.nativeF16 !== winograd.nativeF16) {
                throw new Error(`Dispatch '${record.id}' changed Winograd weight precision.`);
              }
              const transformedWeight = own(
                root
                  .createBuffer(d.arrayOf(d.u32, transformed.bytes.byteLength / 4), (mapped) => {
                    new Uint8Array(mapped.arrayBuffer).set(transformed.bytes);
                  })
                  .$usage('storage')
                  .$name(`DepthART ${record.id} Winograd F4 weight`),
              );
              additionalWeightBytes += transformed.bytes.byteLength;
              const winogradParams = own(
                root
                  .createBuffer(WinogradF2Uniforms, {
                    width: outputShape.width,
                    height: outputShape.height,
                    inputChannelBlocks: inputShape.channelBlocks,
                    outputChannelBlocks: outputShape.channelBlocks,
                    logicalOutputChannels: outputShape.channels,
                    tilesX: winograd.tilesX,
                    tilesY: winograd.tilesY,
                    tileCount: winograd.tileCount,
                    weightBasePairs: 0,
                    biasBase: vec4Base(bias),
                  })
                  .$usage('uniform'),
              );
              const precisionKey = winograd.nativeF16 ? 'native-f16' : 'f32';
              const inputPipeline = pipelineFor(
                `winograd-f4-input-${inputShape.dtype}-to-${precisionKey}`,
                () =>
                  root
                    .with(winogradF2SourceIsF16Slot, inputShape.dtype === DepthDType.F16)
                    .with(winogradF2TransformedInputIsF16Slot, winograd.nativeF16)
                    .createComputePipeline({ compute: winogradF4InputTransformKernel }),
              );
              const gemmShape: WinogradGemmShape = {
                tileCount: winograd.tileCount,
                inputChannelBlocks: inputShape.channelBlocks,
                outputChannelBlocks: outputShape.channelBlocks,
              };
              const gemmTile = winogradGemmTileFor(gemmShape);
              const gemmPipeline = gemmTile
                ? pipelineFor(
                    `winograd-f4-gemm-${winogradGemmShapeKey(gemmShape, winograd.nativeF16)}`,
                    () =>
                      root.createComputePipeline({
                        compute: createSpecializedWinogradGemmKernel(
                          gemmShape,
                          gemmTile,
                          winograd.nativeF16,
                        ),
                      }),
                  )
                : pipelineFor(`winograd-f4-gemm-${precisionKey}`, () =>
                    root.createComputePipeline({
                      compute: winograd.nativeF16
                        ? winogradF2GemmF16Kernel
                        : winogradF2GemmF32Kernel,
                    }),
                  );
              const outputPipeline = pipelineFor(
                `winograd-f4-output-${outputShape.dtype}-${activationKey}`,
                () =>
                  root
                    .with(activationSlot, activation)
                    .with(winogradF2DestinationIsF16Slot, outputShape.dtype === DepthDType.F16)
                    .createComputePipeline({ compute: winogradF4OutputTransformKernel }),
              );
              const inputPairWorkgroups = splitWorkgroups(
                Math.ceil(
                  (winograd.tileCount * inputShape.channelBlocks) / WINOGRAD_F4_PAIRS_PER_WORKGROUP,
                ),
              );
              const outputPairWorkgroups = splitWorkgroups(
                Math.ceil(
                  (winograd.tileCount * outputShape.channelBlocks) /
                    WINOGRAD_F4_PAIRS_PER_WORKGROUP,
                ),
              );
              const inputScratchBinding = { buffer: root.unwrap(winogradInputScratch) };
              const outputScratchBinding = { buffer: root.unwrap(winogradOutputScratch) };
              dispatches.push(
                {
                  label: `${record.id}/winograd-f4-input`,
                  pipeline: inputPipeline,
                  bindGroups: [
                    createPreparedRawBindGroup(
                      root,
                      winogradF2InputLayout,
                      {
                        params: { buffer: root.unwrap(winogradParams) },
                        src: rawArenaBinding(arena, src),
                        dst: inputScratchBinding,
                      },
                      `DepthART ${record.id} Winograd input`,
                    ),
                  ],
                  workgroups: inputPairWorkgroups,
                },
                {
                  label: `${record.id}/winograd-f4-gemm`,
                  pipeline: gemmPipeline,
                  bindGroups: [
                    createPreparedRawBindGroup(
                      root,
                      winogradF2GemmLayout,
                      {
                        params: { buffer: root.unwrap(winogradParams) },
                        src: inputScratchBinding,
                        weights: { buffer: root.unwrap(transformedWeight) },
                        dst: outputScratchBinding,
                      },
                      `DepthART ${record.id} Winograd GEMM`,
                    ),
                  ],
                  workgroups: winogradGemmSpecializedWorkgroups(gemmShape) ?? {
                    x: Math.ceil(
                      outputShape.channelBlocks /
                        (winograd.nativeF16
                          ? WINOGRAD_F2_F16_OUTPUT_BLOCK_TILE
                          : WINOGRAD_F2_F32_OUTPUT_BLOCK_TILE),
                    ),
                    y: Math.ceil(
                      winograd.tileCount /
                        (winograd.nativeF16
                          ? WINOGRAD_F2_F16_TILE_TILE
                          : WINOGRAD_F2_F32_TILE_TILE),
                    ),
                    z: winograd.coefficients,
                  },
                },
                {
                  label: `${record.id}/winograd-f4-output`,
                  pipeline: outputPipeline,
                  bindGroups: [
                    createPreparedRawBindGroup(
                      root,
                      winogradF2OutputLayout,
                      {
                        params: { buffer: root.unwrap(winogradParams) },
                        src: outputScratchBinding,
                        bias: sectionBinding(bundle, weights, bias),
                        dst: rawArenaBinding(arena, dst),
                      },
                      `DepthART ${record.id} Winograd output`,
                    ),
                  ],
                  workgroups: outputPairWorkgroups,
                },
              );
              continue;
            }
            const takesOuterProduct =
              nativeF16 &&
              kernelHeight === 1 &&
              specializedPointwiseWorkgroups !== undefined &&
              pointwiseShape !== undefined &&
              pointwiseTile !== undefined;
            let halfWeights: PackedWeightBuffer | undefined;
            if (convertsToHalf) {
              const halfBytes = convertWeightToHalf(bundle, weight, takesOuterProduct);
              additionalWeightBytes += halfBytes.byteLength;
              halfWeights = own(
                root
                  .createBuffer(d.arrayOf(d.u32, halfBytes.byteLength / 4), (mapped) => {
                    new Uint8Array(mapped.arrayBuffer).set(halfBytes);
                  })
                  .$usage('storage')
                  .$name(`DepthART ${record.id} FP16 weight`),
              );
            }
            const params = own(
              root
                .createBuffer(Conv2dUniforms, {
                  inputWidth: inputShape.width,
                  inputHeight: inputShape.height,
                  outputWidth: outputShape.width,
                  outputHeight: outputShape.height,
                  inputChannelBlocks: inputShape.channelBlocks,
                  outputChannelBlocks: outputShape.channelBlocks,
                  logicalOutputChannels: outputShape.channels,
                  strideX,
                  strideY,
                  padX: padLeft,
                  padY: padTop,
                  elementCount: outputShape.elementCount,
                  weightBase: halfWeights ? 0 : vec4Base(weight),
                  biasBase: vec4Base(bias),
                })
                .$usage('uniform'),
            );
            const selectedLayout = nativeF16 ? nativeF16Conv2dLayout : conv2dLayout;
            const nativeCompute =
              kernelHeight === 1 ? nativeF16Conv1x1Kernel : nativeF16Conv3x3Kernel;
            const nativeIoKey = `${inputShape.dtype}-to-${outputShape.dtype}`;
            const pipelineKey = `conv-${kernelHeight}x${kernelWidth}-${activationKey}`;
            const withActivation = () => root.with(activationSlot, activation);
            const withNativeIo = () =>
              withActivation()
                .with(nativeF16SourceIsF16Slot, inputShape.dtype === DepthDType.F16)
                .with(nativeF16DestinationIsF16Slot, outputShape.dtype === DepthDType.F16);

            let pipeline: TgpuComputePipeline;
            if (specializedPointwiseWorkgroups && pointwiseShape && pointwiseTile) {
              const shapeKey = `${pointwiseShapeKey(pointwiseShape)}-${pointwiseTile.pixelsPerThread}`;
              if (nativeF16) {
                if (!convertsToHalf) {
                  outerProductWeights.add(weight.id);
                }
                pipeline = pipelineFor(
                  `conv-1x1-specialized-native-f16-${nativeIoKey}-${shapeKey}-${activationKey}`,
                  () =>
                    withNativeIo().createComputePipeline({
                      compute: createNativeF16SpecializedConv1x1Kernel(
                        pointwiseShape,
                        pointwiseTile,
                      ),
                    }),
                );
              } else {
                pipeline = pipelineFor(`conv-1x1-specialized-${shapeKey}-${activationKey}`, () =>
                  withActivation().createComputePipeline({
                    compute: createSpecializedConv1x1Kernel(pointwiseShape, pointwiseTile),
                  }),
                );
              }
            } else if (specializedSpatialWorkgroups && spatialShape && spatialTile) {
              const shapeKey = spatialShapeKey(spatialShape);
              if (nativeF16) {
                pipeline = pipelineFor(
                  `conv-3x3-specialized-native-f16-${nativeIoKey}-${shapeKey}-${activationKey}`,
                  () =>
                    withNativeIo().createComputePipeline({
                      compute: createNativeF16Conv3x3SpecializedKernel(spatialShape, spatialTile),
                    }),
                );
              } else {
                pipeline = pipelineFor(`conv-3x3-specialized-${shapeKey}-${activationKey}`, () =>
                  withActivation().createComputePipeline({
                    compute: createConv3x3SpecializedKernel(spatialShape, spatialTile),
                  }),
                );
              }
            } else if (nativeF16) {
              pipeline = pipelineFor(
                `conv-${kernelHeight}x${kernelWidth}-native-f16-${nativeIoKey}-${activationKey}`,
                () => withNativeIo().createComputePipeline({ compute: nativeCompute }),
              );
            } else {
              pipeline = pipelineFor(pipelineKey, () =>
                withActivation().createComputePipeline({ compute }),
              );
            }
            dispatches.push({
              label: record.id,
              pipeline,
              bindGroups: [
                createPreparedRawBindGroup(
                  root,
                  selectedLayout,
                  {
                    params: { buffer: root.unwrap(params) },
                    src: rawArenaBinding(arena, src),
                    weights: halfWeights
                      ? { buffer: root.unwrap(halfWeights) }
                      : sectionBinding(bundle, weights, weight),
                    bias: sectionBinding(bundle, weights, bias),
                    dst: rawArenaBinding(arena, dst),
                  },
                  `DepthART ${record.id}`,
                ),
              ],
              workgroups: specializedSpatialWorkgroups ??
                specializedPointwiseWorkgroups ?? {
                  x: Math.ceil(outputShape.elementCount / DEPTH_WIDE_WORKGROUP_SIZE),
                },
            });
            break;
          }

          const compute =
            kernelHeight === 3 && kernelWidth === 3
              ? depthwise3x3Kernel
              : kernelHeight === 1 && kernelWidth === 7
                ? depthwiseHorizontalAxisKernel
                : kernelHeight === 7 && kernelWidth === 1
                  ? depthwiseVerticalAxisKernel
                  : undefined;
          const nativeF16 = usesNativeF16(weight);
          const nativeF16WeightOnly =
            nativeF16 &&
            inputShape.dtype === DepthDType.F32 &&
            outputShape.dtype === DepthDType.F32;
          if (
            !nativeF16 &&
            (inputShape.dtype !== DepthDType.F32 || outputShape.dtype !== DepthDType.F32)
          ) {
            throw new Error(
              `Dispatch '${record.id}' requires FP32 activations unless it uses native FP16 weights.`,
            );
          }
          if (!compute || record.params.groups !== inputShape.channels) {
            throw new Error(`Dispatch '${record.id}' uses an unsupported depthwise convolution.`);
          }
          const params = own(
            root
              .createBuffer(DepthwiseConvUniforms, {
                inputWidth: inputShape.width,
                inputHeight: inputShape.height,
                outputWidth: outputShape.width,
                outputHeight: outputShape.height,
                channelBlocks: inputShape.channelBlocks,
                logicalChannels: inputShape.channels,
                strideX,
                strideY,
                padX: padLeft,
                padY: padTop,
                kernelLength: Math.max(kernelHeight, kernelWidth),
                elementCount: outputShape.elementCount,
                weightBase: vec4Base(weight),
                biasBase: vec4Base(bias),
              })
              .$usage('uniform'),
          );
          const packedCompute =
            kernelHeight === 3 && kernelWidth === 3
              ? packedF16Depthwise3x3Kernel
              : kernelHeight === 1 && kernelWidth === 7
                ? packedF16DepthwiseHorizontalAxisKernel
                : packedF16DepthwiseVerticalAxisKernel;
          const nativeCompute =
            kernelHeight === 3 && kernelWidth === 3
              ? nativeF16Depthwise3x3Kernel
              : kernelHeight === 1 && kernelWidth === 7
                ? nativeF16DepthwiseHorizontalAxisKernel
                : nativeF16DepthwiseVerticalAxisKernel;
          const selectedLayout =
            nativeF16 && !nativeF16WeightOnly
              ? nativeF16DepthwiseConvLayout
              : nativeF16WeightOnly
                ? packedF16DepthwiseConvLayout
                : depthwiseConvLayout;
          const nativeIoKey = `${inputShape.dtype}-to-${outputShape.dtype}`;
          const pipeline =
            nativeF16 && !nativeF16WeightOnly
              ? pipelineFor(
                  `depthwise-${kernelHeight}x${kernelWidth}-native-f16-${nativeIoKey}-${activationKey}`,
                  () =>
                    root
                      .with(activationSlot, activation)
                      .with(nativeF16SourceIsF16Slot, inputShape.dtype === DepthDType.F16)
                      .with(nativeF16DestinationIsF16Slot, outputShape.dtype === DepthDType.F16)
                      .createComputePipeline({ compute: nativeCompute }),
                )
              : pipelineFor(
                  `depthwise-${kernelHeight}x${kernelWidth}-${nativeF16WeightOnly ? 'f16-weight-f32-' : ''}${activationKey}`,
                  () =>
                    root.with(activationSlot, activation).createComputePipeline({
                      compute: nativeF16WeightOnly ? packedCompute : compute,
                    }),
                );
          dispatches.push({
            label: record.id,
            pipeline,
            bindGroups: [
              createPreparedRawBindGroup(
                root,
                selectedLayout,
                {
                  params: { buffer: root.unwrap(params) },
                  src: rawArenaBinding(arena, src),
                  weights: sectionBinding(bundle, weights, weight),
                  bias: sectionBinding(bundle, weights, bias),
                  dst: rawArenaBinding(arena, dst),
                },
                `DepthART ${record.id}`,
              ),
            ],
            workgroups: { x: record.workgroups[0] },
          });
          break;
        }

        case 'activation': {
          const src = dispatchTensor(bundle, record, 'inputs', 0);
          const dst = dispatchTensor(bundle, record, 'outputs', 0);
          const shape = hwc4Shape(dst);
          const compute =
            record.params.kind === DepthActivation.Gelu
              ? geluExact
              : record.params.kind === DepthActivation.Silu
                ? silu
                : relu;
          const unaryShape: ElementwiseShape = {
            elementCount: shape.elementCount,
            channelBlocks: shape.channelBlocks,
            logicalChannels: shape.channels,
          };
          dispatches.push({
            label: record.id,
            pipeline: pipelineFor(
              `activation-${record.params.kind}-${elementwiseShapeKey(unaryShape)}`,
              () =>
                root.createComputePipeline({
                  compute: createUnaryKernel(unaryShape, compute),
                }),
            ),
            bindGroups: [
              createPreparedRawBindGroup(
                root,
                unaryLayout,
                {
                  src: rawArenaBinding(arena, src),
                  dst: rawArenaBinding(arena, dst),
                },
                `DepthART ${record.id}`,
              ),
            ],
            workgroups: { x: record.workgroups[0] },
          });
          break;
        }

        case 'binary': {
          const lhs = dispatchTensor(bundle, record, 'inputs', 0);
          const rhs = dispatchTensor(bundle, record, 'inputs', 1);
          const dst = dispatchTensor(bundle, record, 'outputs', 0);
          const shape = hwc4Shape(dst);
          const combine =
            record.params.kind === DepthBinaryKind.Add
              ? addCombine
              : record.params.kind === DepthBinaryKind.Subtract
                ? subtractCombine
                : multiplyCombine;
          const binaryShape: ElementwiseShape = {
            elementCount: shape.elementCount,
            channelBlocks: shape.channelBlocks,
            logicalChannels: shape.channels,
          };
          const broadcastCode = binaryBroadcastCode(record.params.broadcast);
          const params = own(
            root
              .createBuffer(ElementwiseUniforms, {
                rhsBase: rhs.storage.kind === 'section' ? vec4Base(rhs) : 0,
              })
              .$usage('uniform'),
          );
          dispatches.push({
            label: record.id,
            pipeline: pipelineFor(
              `binary-${record.params.kind}-${broadcastCode}-${elementwiseShapeKey(binaryShape)}`,
              () =>
                root.createComputePipeline({
                  compute: createBinaryKernel(binaryShape, combine, broadcastCode),
                }),
            ),
            bindGroups: [
              createPreparedRawBindGroup(
                root,
                binaryLayout,
                {
                  params: { buffer: root.unwrap(params) },
                  lhs: rawArenaBinding(arena, lhs),
                  rhs:
                    rhs.storage.kind === 'section'
                      ? sectionBinding(bundle, weights, rhs)
                      : rawArenaBinding(arena, rhs),
                  dst: rawArenaBinding(arena, dst),
                },
                `DepthART ${record.id}`,
              ),
            ],
            workgroups: { x: record.workgroups[0] },
          });
          break;
        }

        case 'channel-affine': {
          const src = dispatchTensor(bundle, record, 'inputs', 0);
          const scale = dispatchTensor(bundle, record, 'inputs', 1);
          const bias = dispatchTensor(bundle, record, 'inputs', 2);
          const dst = dispatchTensor(bundle, record, 'outputs', 0);
          const shape = hwc4Shape(dst);
          const params = own(
            root
              .createBuffer(ChannelAffineUniforms, {
                elementCount: shape.elementCount,
                logicalChannels: shape.channels,
                channelBlocks: shape.channelBlocks,
                scaleBase: vec4Base(scale),
                biasBase: vec4Base(bias),
              })
              .$usage('uniform'),
          );
          dispatches.push({
            label: record.id,
            pipeline: pipelineFor('channel-affine', () =>
              root.createComputePipeline({ compute: channelAffineKernel }),
            ),
            bindGroups: [
              createPreparedRawBindGroup(
                root,
                channelAffineLayout,
                {
                  params: { buffer: root.unwrap(params) },
                  src: rawArenaBinding(arena, src),
                  scale: sectionBinding(bundle, weights, scale),
                  bias: sectionBinding(bundle, weights, bias),
                  dst: rawArenaBinding(arena, dst),
                },
                `DepthART ${record.id}`,
              ),
            ],
            workgroups: { x: record.workgroups[0] },
          });
          break;
        }

        case 'channel-split': {
          const src = dispatchTensor(bundle, record, 'inputs', 0);
          const low = dispatchTensor(bundle, record, 'outputs', 0);
          const high = dispatchTensor(bundle, record, 'outputs', 1);
          const inputShape = hwc4Shape(src);
          const lowShape = hwc4Shape(low);
          const highShape = hwc4Shape(high);
          const params = own(
            root
              .createBuffer(ChannelViewUniforms, {
                lowChannelBlocks: lowShape.channelBlocks,
                highChannelBlocks: highShape.channelBlocks,
                totalChannelBlocks: inputShape.channelBlocks,
                elementCount: inputShape.elementCount,
              })
              .$usage('uniform'),
          );
          dispatches.push({
            label: record.id,
            pipeline: pipelineFor('channel-split', () =>
              root.createComputePipeline({ compute: channelSplitKernel }),
            ),
            bindGroups: [
              createPreparedRawBindGroup(
                root,
                channelSplitLayout,
                {
                  params: { buffer: root.unwrap(params) },
                  src: rawArenaBinding(arena, src),
                  lowDst: rawArenaBinding(arena, low),
                  highDst: rawArenaBinding(arena, high),
                },
                `DepthART ${record.id}`,
              ),
            ],
            workgroups: { x: record.workgroups[0] },
          });
          break;
        }

        case 'channel-concat': {
          const low = dispatchTensor(bundle, record, 'inputs', 0);
          const high = dispatchTensor(bundle, record, 'inputs', 1);
          const dst = dispatchTensor(bundle, record, 'outputs', 0);
          const lowShape = hwc4Shape(low);
          const highShape = hwc4Shape(high);
          const outputShape = hwc4Shape(dst);
          const params = own(
            root
              .createBuffer(ChannelViewUniforms, {
                lowChannelBlocks: lowShape.channelBlocks,
                highChannelBlocks: highShape.channelBlocks,
                totalChannelBlocks: outputShape.channelBlocks,
                elementCount: outputShape.elementCount,
              })
              .$usage('uniform'),
          );
          dispatches.push({
            label: record.id,
            pipeline: pipelineFor('channel-concat', () =>
              root.createComputePipeline({ compute: channelConcatKernel }),
            ),
            bindGroups: [
              createPreparedRawBindGroup(
                root,
                channelConcatLayout,
                {
                  params: { buffer: root.unwrap(params) },
                  lowSrc: rawArenaBinding(arena, low),
                  highSrc: rawArenaBinding(arena, high),
                  dst: rawArenaBinding(arena, dst),
                },
                `DepthART ${record.id}`,
              ),
            ],
            workgroups: { x: record.workgroups[0] },
          });
          break;
        }

        case 'avg-pool2d': {
          const src = dispatchTensor(bundle, record, 'inputs', 0);
          const dst = dispatchTensor(bundle, record, 'outputs', 0);
          const inputShape = hwc4Shape(src);
          const outputShape = hwc4Shape(dst);
          const [padTop, padLeft, padBottom, padRight] = record.params.padding;
          if (padTop !== 0 || padLeft !== 0 || padBottom !== 0 || padRight !== 0) {
            throw new Error(`Dispatch '${record.id}' requires unsupported padded average pooling.`);
          }
          const [windowHeight, windowWidth] = record.params.kernel;
          const [strideY, strideX] = record.params.stride;
          const params = own(
            root
              .createBuffer(PoolUniforms, {
                inputWidth: inputShape.width,
                inputHeight: inputShape.height,
                outputWidth: outputShape.width,
                outputHeight: outputShape.height,
                channelBlocks: outputShape.channelBlocks,
                logicalChannels: outputShape.channels,
                windowWidth,
                windowHeight,
                strideX,
                strideY,
                elementCount: outputShape.elementCount,
              })
              .$usage('uniform'),
          );
          dispatches.push({
            label: record.id,
            pipeline: pipelineFor('average-pool', () =>
              root.createComputePipeline({ compute: averagePoolKernel }),
            ),
            bindGroups: [
              createPreparedRawBindGroup(
                root,
                poolLayout,
                {
                  params: { buffer: root.unwrap(params) },
                  src: rawArenaBinding(arena, src),
                  dst: rawArenaBinding(arena, dst),
                },
                `DepthART ${record.id}`,
              ),
            ],
            workgroups: { x: record.workgroups[0] },
          });
          break;
        }

        case 'resize2d': {
          const src = dispatchTensor(bundle, record, 'inputs', 0);
          const dst = dispatchTensor(bundle, record, 'outputs', 0);
          const inputShape = hwc4Shape(src);
          const outputShape = hwc4Shape(dst);
          const compute =
            record.params.mode === DepthResizeMode.Nearest &&
            record.params.coordinateMode === DepthResizeCoordinateMode.AsymmetricFloor
              ? nearestAsymmetricResizeKernel
              : record.params.mode === DepthResizeMode.Bilinear &&
                  record.params.coordinateMode === DepthResizeCoordinateMode.HalfPixel
                ? bilinearHalfPixelResizeKernel
                : record.params.mode === DepthResizeMode.Bilinear &&
                    record.params.coordinateMode === DepthResizeCoordinateMode.AlignCorners
                  ? bilinearAlignCornersResizeKernel
                  : undefined;
          if (!compute) {
            throw new Error(`Dispatch '${record.id}' uses an unsupported resize mode.`);
          }
          const params = own(
            root
              .createBuffer(ResizeUniforms, {
                inputWidth: inputShape.width,
                inputHeight: inputShape.height,
                outputWidth: outputShape.width,
                outputHeight: outputShape.height,
                channelBlocks: outputShape.channelBlocks,
                logicalChannels: outputShape.channels,
                elementCount: outputShape.elementCount,
              })
              .$usage('uniform'),
          );
          dispatches.push({
            label: record.id,
            pipeline: pipelineFor(
              `resize-${record.params.mode}-${record.params.coordinateMode}`,
              () => root.createComputePipeline({ compute }),
            ),
            bindGroups: [
              createPreparedRawBindGroup(
                root,
                resizeLayout,
                {
                  params: { buffer: root.unwrap(params) },
                  src: rawArenaBinding(arena, src),
                  dst: rawArenaBinding(arena, dst),
                },
                `DepthART ${record.id}`,
              ),
            ],
            workgroups: { x: record.workgroups[0] },
          });
          break;
        }

        case 'layer-norm': {
          const src = dispatchTensor(bundle, record, 'inputs', 0);
          const gamma = dispatchTensor(bundle, record, 'inputs', 1);
          const beta = dispatchTensor(bundle, record, 'inputs', 2);
          const dst = dispatchTensor(bundle, record, 'outputs', 0);
          const shape = hwc4Shape(dst);
          const params = own(
            root
              .createBuffer(LayerNormUniforms, {
                pixelCount: shape.width * shape.height,
                logicalChannels: shape.channels,
                channelBlocks: shape.channelBlocks,
                epsilon: record.params.epsilon,
                gammaBase: vec4Base(gamma),
                betaBase: vec4Base(beta),
              })
              .$usage('uniform'),
          );
          const layerNormShape: LayerNormShape = {
            pixelCount: shape.width * shape.height,
            channelBlocks: shape.channelBlocks,
            logicalChannels: shape.channels,
          };
          dispatches.push({
            label: record.id,
            pipeline: pipelineFor(`layer-norm-${layerNormShapeKey(layerNormShape)}`, () =>
              root.createComputePipeline({
                compute: createSpecializedLayerNormKernel(layerNormShape),
              }),
            ),
            bindGroups: [
              createPreparedRawBindGroup(
                root,
                layerNormLayout,
                {
                  params: { buffer: root.unwrap(params) },
                  src: rawArenaBinding(arena, src),
                  gamma: sectionBinding(bundle, weights, gamma),
                  beta: sectionBinding(bundle, weights, beta),
                  dst: rawArenaBinding(arena, dst),
                },
                `DepthART ${record.id}`,
              ),
            ],
            workgroups: { x: layerNormWorkgroups(layerNormShape) },
          });
          break;
        }

        case 'scan-project': {
          const src = dispatchTensor(bundle, record, 'inputs', 0);
          const xProjection = dispatchTensor(bundle, record, 'inputs', 1);
          const dtProjection = dispatchTensor(bundle, record, 'inputs', 2);
          const delta = dispatchTensor(bundle, record, 'outputs', 0);
          const b = dispatchTensor(bundle, record, 'outputs', 1);
          const c = dispatchTensor(bundle, record, 'outputs', 2);
          const shape = hwc4Shape(src);
          const positionCount = shape.width * shape.height;
          if (record.params.dtRank > MAX_SELECTIVE_SCAN_RANK) {
            throw new Error(
              `Dispatch '${record.id}' needs a scan rank above ${MAX_SELECTIVE_SCAN_RANK}.`,
            );
          }
          const params = own(
            root
              .createBuffer(ScanProjectUniforms, {
                width: shape.width,
                height: shape.height,
                logicalChannels: shape.channels,
                channelBlocks: shape.channelBlocks,
                rank: record.params.dtRank,
                positionCount,
                directionPositionCount: 4 * positionCount,
                xProjectionWeightBase: vec4Base(xProjection),
                dtProjectionWeightBase: vec4Base(dtProjection),
              })
              .$usage('uniform'),
          );
          const scanProjectShape: ScanProjectShape = {
            width: shape.width,
            height: shape.height,
            logicalChannels: shape.channels,
            channelBlocks: shape.channelBlocks,
            rank: record.params.dtRank,
            positionCount,
          };
          dispatches.push({
            label: record.id,
            pipeline: pipelineFor(`scan-project-${scanProjectShapeKey(scanProjectShape)}`, () =>
              root.createComputePipeline({
                compute: createSpecializedScanProjectKernel(scanProjectShape),
              }),
            ),
            bindGroups: [
              createPreparedRawBindGroup(
                root,
                scanProjectLayout,
                {
                  params: { buffer: root.unwrap(params) },
                  src: rawArenaBinding(arena, src),
                  weights: sectionBinding(bundle, weights, xProjection),
                  delta: rawArenaBinding(arena, delta),
                  b: rawArenaBinding(arena, b),
                  c: rawArenaBinding(arena, c),
                },
                `DepthART ${record.id}`,
              ),
            ],
            workgroups: { x: positionCount, y: CROSS_SCAN_DIRECTION_COUNT },
          });
          break;
        }

        case 'selective-scan': {
          const src = dispatchTensor(bundle, record, 'inputs', 0);
          const delta = dispatchTensor(bundle, record, 'inputs', 1);
          const b = dispatchTensor(bundle, record, 'inputs', 2);
          const c = dispatchTensor(bundle, record, 'inputs', 3);
          const a = dispatchTensor(bundle, record, 'inputs', 4);
          const skip = dispatchTensor(bundle, record, 'inputs', 5);
          const deltaBias = dispatchTensor(bundle, record, 'inputs', 6);
          const directional = dispatchTensor(bundle, record, 'outputs', 0);
          const shape = hwc4Shape(src);
          const positionCount = shape.width * shape.height;
          const sequenceCount = 4 * shape.channels;
          const params = own(
            root
              .createBuffer(SelectiveScanUniforms, {
                width: shape.width,
                height: shape.height,
                logicalChannels: shape.channels,
                channelBlocks: shape.channelBlocks,
                positionCount,
                sequenceCount,
                aBase: scalarBase(a),
                dBase: scalarBase(skip),
                deltaBiasBase: scalarBase(deltaBias),
              })
              .$usage('uniform'),
          );
          dispatches.push({
            label: record.id,
            pipeline: pipelineFor('selective-scan', () =>
              root.createComputePipeline({ compute: sequentialSelectiveScanKernel }),
            ),
            bindGroups: [
              createPreparedRawBindGroup(
                root,
                selectiveScanLayout,
                {
                  params: { buffer: root.unwrap(params) },
                  src: rawArenaBinding(arena, src),
                  delta: rawArenaBinding(arena, delta),
                  b: rawArenaBinding(arena, b),
                  c: rawArenaBinding(arena, c),
                  a: sectionBinding(bundle, weights, a),
                  d: sectionBinding(bundle, weights, skip),
                  deltaBias: sectionBinding(bundle, weights, deltaBias),
                  directionalDst: rawArenaBinding(arena, directional),
                },
                `DepthART ${record.id}`,
              ),
            ],
            workgroups: { x: record.workgroups[0] },
          });
          break;
        }

        case 'scan-merge': {
          const directional = dispatchTensor(bundle, record, 'inputs', 0);
          const dst = dispatchTensor(bundle, record, 'outputs', 0);
          const shape = hwc4Shape(dst);
          const positionCount = shape.width * shape.height;
          const params = own(
            root
              .createBuffer(CrossScanUniforms, {
                width: shape.width,
                height: shape.height,
                logicalChannels: shape.channels,
                channelBlocks: shape.channelBlocks,
                positionCount,
                elementCount: shape.elementCount,
              })
              .$usage('uniform'),
          );
          dispatches.push({
            label: record.id,
            pipeline: pipelineFor('scan-merge', () =>
              root.createComputePipeline({ compute: crossMergeKernel }),
            ),
            bindGroups: [
              createPreparedRawBindGroup(
                root,
                crossMergeLayout,
                {
                  params: { buffer: root.unwrap(params) },
                  directionalSrc: rawArenaBinding(arena, directional),
                  dst: rawArenaBinding(arena, dst),
                },
                `DepthART ${record.id}`,
              ),
            ],
            workgroups: { x: record.workgroups[0] },
          });
          break;
        }
      }
    }
    if (!outputPolarityApplied) {
      throw new Error('Depth output polarity was not applied by its producing dispatch.');
    }
    assertTransposedWeightsMatchRouting(weights, outerProductWeights);
  } catch (error) {
    for (const resource of ownedResources) {
      resource.destroy();
    }
    throw error;
  }

  return {
    dispatches,
    ownedResources,
    additionalWeightBytes,
    additionalActivationBytes: maximumWinogradInputBytes + maximumWinogradOutputBytes,
  };
}
