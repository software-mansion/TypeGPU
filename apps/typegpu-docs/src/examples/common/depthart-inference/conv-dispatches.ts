import type { TgpuComputePipeline } from 'typegpu';
import {
  ACTIVATION_FUNCTIONS,
  dispatchTensor,
  plainHwc4Shape,
  sectionBinding,
  sectionFor,
  usesNativeF16,
  vec4Base,
  type DispatchContext,
  type PlainHwc4Shape,
} from './dispatch-helpers.ts';
import type { WeightTranspose } from './gpu-resources.ts';
import { convertWeightToHalf } from './half-weights.ts';
import {
  depthwise3x3Kernel,
  depthwiseHorizontalAxisKernel,
  depthwiseVerticalAxisKernel,
} from './kernels/depthwise.ts';
import { activationSlot, negated } from './kernels/helpers.ts';
import {
  Conv2dUniforms,
  DepthwiseConvUniforms,
  conv2dLayout,
  depthwiseConvLayout,
  nativeF16Conv2dLayout,
  nativeF16DepthwiseConvLayout,
  packedF16DepthwiseConvLayout,
} from './kernels/layouts.ts';
import {
  createNativeF16Conv3x3SpecializedKernel,
  createNativeF16SpecializedConv1x1Kernel,
  nativeF16Conv1x1Kernel,
  nativeF16Conv3x3Kernel,
  nativeF16Depthwise3x3Kernel,
  nativeF16DepthwiseHorizontalAxisKernel,
  nativeF16DepthwiseVerticalAxisKernel,
  nativeF16DestinationIsF16Slot,
  nativeF16SourceIsF16Slot,
} from './kernels/native-f16-conv.ts';
import {
  packedF16Depthwise3x3Kernel,
  packedF16DepthwiseHorizontalAxisKernel,
  packedF16DepthwiseVerticalAxisKernel,
} from './kernels/packed-f16-conv.ts';
import { conv1x1Kernel, createSpecializedConv1x1Kernel } from './kernels/pointwise.ts';
import { conv3x3Kernel, createConv3x3SpecializedKernel } from './kernels/spatial-conv.ts';
import {
  DEPTH_WIDE_WORKGROUP_SIZE,
  pointwisePlanFor,
  shapeKey,
  spatialPlanFor,
  type PointwiseShape,
  type SpatialShape,
} from './kernels/types.ts';
import {
  DepthDType,
  DepthOutputPolarity,
  DepthPrecision,
  DepthTensorLayout,
  type DepthBundle,
  type DepthDispatch,
  type DepthDispatchOf,
} from './types.ts';
import type { ConvEnv, WinogradDispatcher } from './winograd-dispatches.ts';

type ConvRecord = DepthDispatchOf<'conv2d' | 'depthwise-conv2d'>;

const CONV_KERNELS = {
  pointwise: { f32: conv1x1Kernel, native: nativeF16Conv1x1Kernel },
  spatial: { f32: conv3x3Kernel, native: nativeF16Conv3x3Kernel },
};

const DEPTHWISE_KERNELS = {
  square: {
    f32: depthwise3x3Kernel,
    packed: packedF16Depthwise3x3Kernel,
    native: nativeF16Depthwise3x3Kernel,
  },
  horizontal: {
    f32: depthwiseHorizontalAxisKernel,
    packed: packedF16DepthwiseHorizontalAxisKernel,
    native: nativeF16DepthwiseHorizontalAxisKernel,
  },
  vertical: {
    f32: depthwiseVerticalAxisKernel,
    packed: packedF16DepthwiseVerticalAxisKernel,
    native: nativeF16DepthwiseVerticalAxisKernel,
  },
};

function pointwiseShapeFor(
  record: ConvRecord,
  input: PlainHwc4Shape,
  output: PlainHwc4Shape,
): PointwiseShape | undefined {
  const [kernelHeight, kernelWidth] = record.params.kernel;
  const [strideY, strideX] = record.params.stride;
  if (
    kernelHeight !== 1 ||
    kernelWidth !== 1 ||
    strideX !== 1 ||
    strideY !== 1 ||
    input.width !== output.width ||
    input.height !== output.height
  ) {
    return undefined;
  }
  return {
    inputChannelBlocks: input.channelBlocks,
    outputChannelBlocks: output.channelBlocks,
    pixelCount: output.width * output.height,
    logicalOutputChannels: output.channels,
  };
}

function spatialShapeFor(
  record: ConvRecord,
  input: PlainHwc4Shape,
  output: PlainHwc4Shape,
): SpatialShape {
  const [strideY, strideX] = record.params.stride;
  const [padTop, padLeft] = record.params.padding;
  return {
    inputChannelBlocks: input.channelBlocks,
    outputChannelBlocks: output.channelBlocks,
    inputWidth: input.width,
    inputHeight: input.height,
    outputWidth: output.width,
    outputHeight: output.height,
    strideX,
    strideY,
    padX: padLeft,
    padY: padTop,
    logicalOutputChannels: output.channels,
  };
}

function usesOuterProductPointwise(bundle: DepthBundle, record: DepthDispatch): boolean {
  if (record.op !== 'conv2d' || record.params.groups !== 1) {
    return false;
  }
  const weight = dispatchTensor(bundle, record, 'inputs', 1);
  if (!usesNativeF16(weight)) {
    return false;
  }
  const input = plainHwc4Shape(dispatchTensor(bundle, record, 'inputs', 0));
  const output = plainHwc4Shape(dispatchTensor(bundle, record, 'outputs', 0));
  const shape = pointwiseShapeFor(record, input, output);
  return shape !== undefined && pointwisePlanFor(shape) !== undefined;
}

/** Weight tensors to upload with their lane pair transposed */
export function outerProductPointwiseWeights(bundle: DepthBundle): readonly WeightTranspose[] {
  const transposes: WeightTranspose[] = [];
  for (const record of bundle.dispatches) {
    if (!usesOuterProductPointwise(bundle, record)) {
      continue;
    }
    const weight = dispatchTensor(bundle, record, 'inputs', 1);
    const section = sectionFor(bundle, weight);
    transposes.push({
      byteOffset: section.byteOffset + vec4Base(weight) * 16,
      byteLength: weight.byteLength,
      elementBytes: weight.dtype === DepthDType.F16 ? 2 : 4,
    });
  }
  return transposes;
}

export function buildConvDispatch(
  ctx: DispatchContext,
  winograd: WinogradDispatcher,
  record: ConvRecord,
): void {
  const src = dispatchTensor(ctx.bundle, record, 'inputs', 0);
  const weight = dispatchTensor(ctx.bundle, record, 'inputs', 1);
  const bias = dispatchTensor(ctx.bundle, record, 'inputs', 2);
  const dst = dispatchTensor(ctx.bundle, record, 'outputs', 0);
  const input = plainHwc4Shape(src);
  const output = plainHwc4Shape(dst);
  const invertsOutput =
    ctx.bundle.output.polarity === DepthOutputPolarity.Inverted &&
    dst.id === ctx.bundle.output.tensorId;
  const baseActivation = ACTIVATION_FUNCTIONS[record.params.activation];
  const env: ConvEnv = {
    src,
    weight,
    bias,
    dst,
    input,
    output,
    activation: invertsOutput ? negated(baseActivation) : baseActivation,
    activationKey: `${record.params.activation}${invertsOutput ? '-inverted-output' : ''}`,
  };
  if (record.op === 'depthwise-conv2d') {
    buildDepthwiseConv(ctx, record, env);
  } else if (!winograd.build(record, env)) {
    buildRegularConv(ctx, record, env);
  }
}

function buildRegularConv(ctx: DispatchContext, record: ConvRecord, env: ConvEnv): void {
  const { src, weight, bias, dst, input, output, activation, activationKey } = env;
  const [kernelHeight, kernelWidth] = record.params.kernel;
  const [strideY, strideX] = record.params.stride;
  const [padTop, padLeft] = record.params.padding;
  const kernels = kernelHeight === 1 ? CONV_KERNELS.pointwise : CONV_KERNELS.spatial;
  /** Winograd claims its eligible dispatches first, so an FP32 O4/I4 weight converts here */
  const convertsToHalf =
    ctx.bundle.precision === DepthPrecision.Fp16Native &&
    weight.dtype === DepthDType.F32 &&
    weight.layout === DepthTensorLayout.O4I4Yx;
  const nativeF16 = usesNativeF16(weight) || convertsToHalf;
  const pointwiseShape = pointwiseShapeFor(record, input, output);
  const pointwisePlan = pointwiseShape ? pointwisePlanFor(pointwiseShape) : undefined;
  const spatialShape =
    kernelHeight === 3 && kernelWidth === 3 ? spatialShapeFor(record, input, output) : undefined;
  const spatialPlan = spatialShape ? spatialPlanFor(spatialShape) : undefined;
  const takesOuterProduct = nativeF16 && pointwisePlan !== undefined;
  const halfWeights = convertsToHalf
    ? ctx.storageFromBytes(convertWeightToHalf(ctx.bundle, weight, takesOuterProduct))
    : undefined;
  const params = ctx.uniform(Conv2dUniforms, {
    inputWidth: input.width,
    inputHeight: input.height,
    outputWidth: output.width,
    outputHeight: output.height,
    inputChannelBlocks: input.channelBlocks,
    outputChannelBlocks: output.channelBlocks,
    logicalOutputChannels: output.channels,
    strideX,
    strideY,
    padX: padLeft,
    padY: padTop,
    elementCount: output.elementCount,
    weightBase: halfWeights ? 0 : vec4Base(weight),
    biasBase: vec4Base(bias),
  });
  const nativeIoKey = `${input.dtype}-to-${output.dtype}`;
  const withActivation = () => ctx.root.with(activationSlot, activation);
  const withNativeIo = () =>
    withActivation()
      .with(nativeF16SourceIsF16Slot, input.dtype === DepthDType.F16)
      .with(nativeF16DestinationIsF16Slot, output.dtype === DepthDType.F16);

  let pipeline: TgpuComputePipeline;
  if (pointwiseShape && pointwisePlan) {
    const key = `${shapeKey(pointwiseShape)}-${pointwisePlan.tile.pixelsPerThread}`;
    pipeline = nativeF16
      ? ctx.pipelineFor(
          `conv-1x1-specialized-native-f16-${nativeIoKey}-${key}-${activationKey}`,
          () =>
            withNativeIo().createComputePipeline({
              compute: createNativeF16SpecializedConv1x1Kernel(pointwiseShape, pointwisePlan.tile),
            }),
        )
      : ctx.pipelineFor(`conv-1x1-specialized-${key}-${activationKey}`, () =>
          withActivation().createComputePipeline({
            compute: createSpecializedConv1x1Kernel(pointwiseShape, pointwisePlan.tile),
          }),
        );
  } else if (spatialShape && spatialPlan) {
    const key = shapeKey(spatialShape);
    pipeline = nativeF16
      ? ctx.pipelineFor(
          `conv-3x3-specialized-native-f16-${nativeIoKey}-${key}-${activationKey}`,
          () =>
            withNativeIo().createComputePipeline({
              compute: createNativeF16Conv3x3SpecializedKernel(spatialShape, spatialPlan.tile),
            }),
        )
      : ctx.pipelineFor(`conv-3x3-specialized-${key}-${activationKey}`, () =>
          withActivation().createComputePipeline({
            compute: createConv3x3SpecializedKernel(spatialShape, spatialPlan.tile),
          }),
        );
  } else if (nativeF16) {
    pipeline = ctx.pipelineFor(
      `conv-${kernelHeight}x${kernelWidth}-native-f16-${nativeIoKey}-${activationKey}`,
      () => withNativeIo().createComputePipeline({ compute: kernels.native }),
    );
  } else {
    pipeline = ctx.pipelineFor(`conv-${kernelHeight}x${kernelWidth}-${activationKey}`, () =>
      withActivation().createComputePipeline({ compute: kernels.f32 }),
    );
  }

  const entries = {
    params,
    src: ctx.arena.rawBufferFor(src.id),
    weights: halfWeights ?? sectionBinding(ctx.bundle, ctx.weights, weight),
    bias: sectionBinding(ctx.bundle, ctx.weights, bias),
    dst: ctx.arena.rawBufferFor(dst.id),
  };
  ctx.dispatches.push({
    pipeline,
    bindGroup: nativeF16
      ? ctx.root.createBindGroup(nativeF16Conv2dLayout, entries)
      : ctx.root.createBindGroup(conv2dLayout, entries),
    workgroups: (pointwisePlan ?? spatialPlan)?.workgroups ?? {
      x: Math.ceil(output.elementCount / DEPTH_WIDE_WORKGROUP_SIZE),
    },
  });
}

function buildDepthwiseConv(ctx: DispatchContext, record: ConvRecord, env: ConvEnv): void {
  const { src, weight, bias, dst, input, output, activation, activationKey } = env;
  const [kernelHeight, kernelWidth] = record.params.kernel;
  const [strideY, strideX] = record.params.stride;
  const [padTop, padLeft] = record.params.padding;
  const kernels =
    kernelHeight === kernelWidth
      ? DEPTHWISE_KERNELS.square
      : kernelHeight === 1
        ? DEPTHWISE_KERNELS.horizontal
        : DEPTHWISE_KERNELS.vertical;
  const nativeF16 = usesNativeF16(weight);
  const nativeF16WeightOnly =
    nativeF16 && input.dtype === DepthDType.F32 && output.dtype === DepthDType.F32;
  const nativeIo = nativeF16 && !nativeF16WeightOnly;
  const params = ctx.uniform(DepthwiseConvUniforms, {
    inputWidth: input.width,
    inputHeight: input.height,
    outputWidth: output.width,
    outputHeight: output.height,
    channelBlocks: input.channelBlocks,
    logicalChannels: input.channels,
    strideX,
    strideY,
    padX: padLeft,
    padY: padTop,
    kernelLength: Math.max(kernelHeight, kernelWidth),
    elementCount: output.elementCount,
    weightBase: vec4Base(weight),
    biasBase: vec4Base(bias),
  });
  const pipeline = nativeIo
    ? ctx.pipelineFor(
        `depthwise-${kernelHeight}x${kernelWidth}-native-f16-${input.dtype}-to-${output.dtype}-${activationKey}`,
        () =>
          ctx.root
            .with(activationSlot, activation)
            .with(nativeF16SourceIsF16Slot, input.dtype === DepthDType.F16)
            .with(nativeF16DestinationIsF16Slot, output.dtype === DepthDType.F16)
            .createComputePipeline({ compute: kernels.native }),
      )
    : ctx.pipelineFor(
        `depthwise-${kernelHeight}x${kernelWidth}-${nativeF16WeightOnly ? 'f16-weight-f32-' : ''}${activationKey}`,
        () =>
          ctx.root.with(activationSlot, activation).createComputePipeline({
            compute: nativeF16WeightOnly ? kernels.packed : kernels.f32,
          }),
      );
  const entries = {
    params,
    src: ctx.arena.rawBufferFor(src.id),
    weights: sectionBinding(ctx.bundle, ctx.weights, weight),
    bias: sectionBinding(ctx.bundle, ctx.weights, bias),
    dst: ctx.arena.rawBufferFor(dst.id),
  };
  ctx.dispatches.push({
    pipeline,
    bindGroup: nativeIo
      ? ctx.root.createBindGroup(nativeF16DepthwiseConvLayout, entries)
      : nativeF16WeightOnly
        ? ctx.root.createBindGroup(packedF16DepthwiseConvLayout, entries)
        : ctx.root.createBindGroup(depthwiseConvLayout, entries),
    workgroups: { x: record.workgroups[0] },
  });
}
