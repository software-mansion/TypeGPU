import type { TgpuComputeFn, TgpuRoot } from 'typegpu';
import { buildConvDispatch } from './conv-dispatches.ts';
import {
  ACTIVATION_FUNCTIONS,
  createDispatchContext,
  dispatchTensor,
  hwc4Shape,
  scalarBase,
  sectionBinding,
  vec4Base,
  type DispatchContext,
  type Hwc4Shape,
} from './dispatch-helpers.ts';
import type { OwnedGpuResource, PreparedDispatch } from './execution-plan.ts';
import type { ImmutableWeightStorage } from './gpu-resources.ts';
import { channelConcatKernel, channelSplitKernel } from './kernels/channel-views.ts';
import { crossMergeKernel } from './kernels/cross-scan.ts';
import {
  BinaryBroadcastCode,
  addCombine,
  channelAffineKernel,
  createBinaryKernel,
  createUnaryKernel,
  multiplyCombine,
  subtractCombine,
} from './kernels/elementwise.ts';
import {
  ChannelAffineUniforms,
  ChannelViewUniforms,
  CrossScanUniforms,
  ElementwiseUniforms,
  LayerNormUniforms,
  PoolUniforms,
  ResizeUniforms,
  ScanProjectUniforms,
  SelectiveScanUniforms,
  binaryLayout,
  channelAffineLayout,
  channelConcatLayout,
  channelSplitLayout,
  crossMergeLayout,
  layerNormLayout,
  poolLayout,
  resizeLayout,
  scanProjectLayout,
  selectiveScanLayout,
  unaryLayout,
} from './kernels/layouts.ts';
import { createSpecializedLayerNormKernel } from './kernels/normalization.ts';
import { averagePoolKernel } from './kernels/pooling.ts';
import {
  bilinearAlignCornersResizeKernel,
  bilinearHalfPixelResizeKernel,
  nearestAsymmetricResizeKernel,
} from './kernels/resize.ts';
import { createSpecializedScanProjectKernel } from './kernels/scan-project.ts';
import { sequentialSelectiveScanKernel } from './kernels/selective-scan.ts';
import {
  CROSS_SCAN_DIRECTION_COUNT,
  layerNormWorkgroups,
  shapeKey,
  type ElementwiseShape,
  type LayerNormShape,
  type ScanProjectShape,
} from './kernels/types.ts';
import { DepthTensorArena } from './tensor-arena.ts';
import {
  DepthBinaryKind,
  DepthBroadcast,
  DepthResizeCoordinateMode,
  DepthResizeMode,
  type DepthBundle,
  type DepthDispatchOf,
} from './types.ts';
import { createWinogradDispatcher } from './winograd-dispatches.ts';

export interface PreparedDepthDispatches {
  readonly dispatches: readonly PreparedDispatch[];
  readonly ownedResources: readonly OwnedGpuResource[];
}

const BINARY_COMBINES = {
  [DepthBinaryKind.Add]: addCombine,
  [DepthBinaryKind.Subtract]: subtractCombine,
  [DepthBinaryKind.Multiply]: multiplyCombine,
} as const;

const BROADCAST_CODES = {
  [DepthBroadcast.None]: BinaryBroadcastCode.None,
  [DepthBroadcast.Scalar]: BinaryBroadcastCode.Scalar,
  [DepthBroadcast.Channels]: BinaryBroadcastCode.Channels,
  [DepthBroadcast.Spatial]: BinaryBroadcastCode.Spatial,
} as const;

const RESIZE_KERNELS: Partial<Record<string, TgpuComputeFn>> = {
  [`${DepthResizeMode.Nearest}:${DepthResizeCoordinateMode.AsymmetricFloor}`]:
    nearestAsymmetricResizeKernel,
  [`${DepthResizeMode.Bilinear}:${DepthResizeCoordinateMode.HalfPixel}`]:
    bilinearHalfPixelResizeKernel,
  [`${DepthResizeMode.Bilinear}:${DepthResizeCoordinateMode.AlignCorners}`]:
    bilinearAlignCornersResizeKernel,
};

function elementwiseShapeOf(shape: Hwc4Shape): ElementwiseShape {
  return {
    elementCount: shape.elementCount,
    channelBlocks: shape.channelBlocks,
    logicalChannels: shape.channels,
  };
}

export function createDepthDispatches(
  root: TgpuRoot,
  bundle: DepthBundle,
  arena: DepthTensorArena,
  weights: ImmutableWeightStorage,
): PreparedDepthDispatches {
  const ctx = createDispatchContext(root, bundle, arena, weights);
  const winograd = createWinogradDispatcher(ctx);

  for (const record of bundle.dispatches) {
    switch (record.op) {
      case 'conv2d':
      case 'depthwise-conv2d':
        buildConvDispatch(ctx, winograd, record);
        break;
      case 'activation':
        buildActivation(ctx, record);
        break;
      case 'binary':
        buildBinary(ctx, record);
        break;
      case 'channel-affine':
        buildChannelAffine(ctx, record);
        break;
      case 'channel-split':
        buildChannelSplit(ctx, record);
        break;
      case 'channel-concat':
        buildChannelConcat(ctx, record);
        break;
      case 'avg-pool2d':
        buildAveragePool(ctx, record);
        break;
      case 'resize2d':
        buildResize(ctx, record);
        break;
      case 'layer-norm':
        buildLayerNorm(ctx, record);
        break;
      case 'scan-project':
        buildScanProject(ctx, record);
        break;
      case 'selective-scan':
        buildSelectiveScan(ctx, record);
        break;
      case 'scan-merge':
        buildScanMerge(ctx, record);
        break;
    }
  }
  return { dispatches: ctx.dispatches, ownedResources: ctx.ownedResources };
}

function buildActivation(ctx: DispatchContext, record: DepthDispatchOf<'activation'>): void {
  const src = dispatchTensor(ctx.bundle, record, 'inputs', 0);
  const dst = dispatchTensor(ctx.bundle, record, 'outputs', 0);
  const shape = elementwiseShapeOf(hwc4Shape(dst));
  ctx.dispatches.push({
    pipeline: ctx.pipelineFor(`activation-${record.params.kind}-${shapeKey(shape)}`, () =>
      ctx.root.createComputePipeline({
        compute: createUnaryKernel(shape, ACTIVATION_FUNCTIONS[record.params.kind]),
      }),
    ),
    bindGroup: ctx.root.createBindGroup(unaryLayout, {
      src: ctx.arena.rawBufferFor(src.id),
      dst: ctx.arena.rawBufferFor(dst.id),
    }),
    workgroups: { x: record.workgroups[0] },
  });
}

function buildBinary(ctx: DispatchContext, record: DepthDispatchOf<'binary'>): void {
  const lhs = dispatchTensor(ctx.bundle, record, 'inputs', 0);
  const rhs = dispatchTensor(ctx.bundle, record, 'inputs', 1);
  const dst = dispatchTensor(ctx.bundle, record, 'outputs', 0);
  const shape = elementwiseShapeOf(hwc4Shape(dst));
  const broadcastCode = BROADCAST_CODES[record.params.broadcast];
  const rhsFromSection = rhs.storage.kind === 'section';
  const params = ctx.uniform(ElementwiseUniforms, {
    rhsBase: rhsFromSection ? vec4Base(rhs) : 0,
  });
  ctx.dispatches.push({
    pipeline: ctx.pipelineFor(
      `binary-${record.params.kind}-${broadcastCode}-${shapeKey(shape)}`,
      () =>
        ctx.root.createComputePipeline({
          compute: createBinaryKernel(shape, BINARY_COMBINES[record.params.kind], broadcastCode),
        }),
    ),
    bindGroup: ctx.root.createBindGroup(binaryLayout, {
      params,
      lhs: ctx.arena.rawBufferFor(lhs.id),
      rhs: rhsFromSection
        ? sectionBinding(ctx.bundle, ctx.weights, rhs)
        : ctx.arena.rawBufferFor(rhs.id),
      dst: ctx.arena.rawBufferFor(dst.id),
    }),
    workgroups: { x: record.workgroups[0] },
  });
}

function buildChannelAffine(ctx: DispatchContext, record: DepthDispatchOf<'channel-affine'>): void {
  const src = dispatchTensor(ctx.bundle, record, 'inputs', 0);
  const scale = dispatchTensor(ctx.bundle, record, 'inputs', 1);
  const bias = dispatchTensor(ctx.bundle, record, 'inputs', 2);
  const dst = dispatchTensor(ctx.bundle, record, 'outputs', 0);
  const shape = hwc4Shape(dst);
  const params = ctx.uniform(ChannelAffineUniforms, {
    elementCount: shape.elementCount,
    logicalChannels: shape.channels,
    channelBlocks: shape.channelBlocks,
    scaleBase: vec4Base(scale),
    biasBase: vec4Base(bias),
  });
  ctx.dispatches.push({
    pipeline: ctx.pipelineFor('channel-affine', () =>
      ctx.root.createComputePipeline({ compute: channelAffineKernel }),
    ),
    bindGroup: ctx.root.createBindGroup(channelAffineLayout, {
      params,
      src: ctx.arena.rawBufferFor(src.id),
      scale: sectionBinding(ctx.bundle, ctx.weights, scale),
      bias: sectionBinding(ctx.bundle, ctx.weights, bias),
      dst: ctx.arena.rawBufferFor(dst.id),
    }),
    workgroups: { x: record.workgroups[0] },
  });
}

function buildChannelSplit(ctx: DispatchContext, record: DepthDispatchOf<'channel-split'>): void {
  const src = dispatchTensor(ctx.bundle, record, 'inputs', 0);
  const low = dispatchTensor(ctx.bundle, record, 'outputs', 0);
  const high = dispatchTensor(ctx.bundle, record, 'outputs', 1);
  const inputShape = hwc4Shape(src);
  const params = ctx.uniform(ChannelViewUniforms, {
    lowChannelBlocks: hwc4Shape(low).channelBlocks,
    highChannelBlocks: hwc4Shape(high).channelBlocks,
    totalChannelBlocks: inputShape.channelBlocks,
    elementCount: inputShape.elementCount,
  });
  ctx.dispatches.push({
    pipeline: ctx.pipelineFor('channel-split', () =>
      ctx.root.createComputePipeline({ compute: channelSplitKernel }),
    ),
    bindGroup: ctx.root.createBindGroup(channelSplitLayout, {
      params,
      src: ctx.arena.rawBufferFor(src.id),
      lowDst: ctx.arena.rawBufferFor(low.id),
      highDst: ctx.arena.rawBufferFor(high.id),
    }),
    workgroups: { x: record.workgroups[0] },
  });
}

function buildChannelConcat(ctx: DispatchContext, record: DepthDispatchOf<'channel-concat'>): void {
  const low = dispatchTensor(ctx.bundle, record, 'inputs', 0);
  const high = dispatchTensor(ctx.bundle, record, 'inputs', 1);
  const dst = dispatchTensor(ctx.bundle, record, 'outputs', 0);
  const outputShape = hwc4Shape(dst);
  const params = ctx.uniform(ChannelViewUniforms, {
    lowChannelBlocks: hwc4Shape(low).channelBlocks,
    highChannelBlocks: hwc4Shape(high).channelBlocks,
    totalChannelBlocks: outputShape.channelBlocks,
    elementCount: outputShape.elementCount,
  });
  ctx.dispatches.push({
    pipeline: ctx.pipelineFor('channel-concat', () =>
      ctx.root.createComputePipeline({ compute: channelConcatKernel }),
    ),
    bindGroup: ctx.root.createBindGroup(channelConcatLayout, {
      params,
      lowSrc: ctx.arena.rawBufferFor(low.id),
      highSrc: ctx.arena.rawBufferFor(high.id),
      dst: ctx.arena.rawBufferFor(dst.id),
    }),
    workgroups: { x: record.workgroups[0] },
  });
}

function buildAveragePool(ctx: DispatchContext, record: DepthDispatchOf<'avg-pool2d'>): void {
  const src = dispatchTensor(ctx.bundle, record, 'inputs', 0);
  const dst = dispatchTensor(ctx.bundle, record, 'outputs', 0);
  const inputShape = hwc4Shape(src);
  const outputShape = hwc4Shape(dst);
  if (record.params.padding.some((value) => value !== 0)) {
    throw new Error(`Dispatch '${record.id}' requires unsupported padded average pooling.`);
  }
  const [windowHeight, windowWidth] = record.params.kernel;
  const [strideY, strideX] = record.params.stride;
  const params = ctx.uniform(PoolUniforms, {
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
  });
  ctx.dispatches.push({
    pipeline: ctx.pipelineFor('average-pool', () =>
      ctx.root.createComputePipeline({ compute: averagePoolKernel }),
    ),
    bindGroup: ctx.root.createBindGroup(poolLayout, {
      params,
      src: ctx.arena.rawBufferFor(src.id),
      dst: ctx.arena.rawBufferFor(dst.id),
    }),
    workgroups: { x: record.workgroups[0] },
  });
}

function buildResize(ctx: DispatchContext, record: DepthDispatchOf<'resize2d'>): void {
  const src = dispatchTensor(ctx.bundle, record, 'inputs', 0);
  const dst = dispatchTensor(ctx.bundle, record, 'outputs', 0);
  const inputShape = hwc4Shape(src);
  const outputShape = hwc4Shape(dst);
  const { mode, coordinateMode } = record.params;
  const compute = RESIZE_KERNELS[`${mode}:${coordinateMode}`];
  if (!compute) {
    throw new Error(`Dispatch '${record.id}' uses an unsupported resize mode.`);
  }
  const params = ctx.uniform(ResizeUniforms, {
    inputWidth: inputShape.width,
    inputHeight: inputShape.height,
    outputWidth: outputShape.width,
    outputHeight: outputShape.height,
    channelBlocks: outputShape.channelBlocks,
    logicalChannels: outputShape.channels,
    elementCount: outputShape.elementCount,
  });
  ctx.dispatches.push({
    pipeline: ctx.pipelineFor(`resize-${mode}-${coordinateMode}`, () =>
      ctx.root.createComputePipeline({ compute }),
    ),
    bindGroup: ctx.root.createBindGroup(resizeLayout, {
      params,
      src: ctx.arena.rawBufferFor(src.id),
      dst: ctx.arena.rawBufferFor(dst.id),
    }),
    workgroups: { x: record.workgroups[0] },
  });
}

function buildLayerNorm(ctx: DispatchContext, record: DepthDispatchOf<'layer-norm'>): void {
  const src = dispatchTensor(ctx.bundle, record, 'inputs', 0);
  const gamma = dispatchTensor(ctx.bundle, record, 'inputs', 1);
  const beta = dispatchTensor(ctx.bundle, record, 'inputs', 2);
  const dst = dispatchTensor(ctx.bundle, record, 'outputs', 0);
  const shape = hwc4Shape(dst);
  const layerNormShape: LayerNormShape = {
    pixelCount: shape.width * shape.height,
    channelBlocks: shape.channelBlocks,
    logicalChannels: shape.channels,
  };
  const params = ctx.uniform(LayerNormUniforms, {
    ...layerNormShape,
    epsilon: record.params.epsilon,
    gammaBase: vec4Base(gamma),
    betaBase: vec4Base(beta),
  });
  ctx.dispatches.push({
    pipeline: ctx.pipelineFor(`layer-norm-${shapeKey(layerNormShape)}`, () =>
      ctx.root.createComputePipeline({
        compute: createSpecializedLayerNormKernel(layerNormShape),
      }),
    ),
    bindGroup: ctx.root.createBindGroup(layerNormLayout, {
      params,
      src: ctx.arena.rawBufferFor(src.id),
      gamma: sectionBinding(ctx.bundle, ctx.weights, gamma),
      beta: sectionBinding(ctx.bundle, ctx.weights, beta),
      dst: ctx.arena.rawBufferFor(dst.id),
    }),
    workgroups: { x: layerNormWorkgroups(layerNormShape) },
  });
}

function buildScanProject(ctx: DispatchContext, record: DepthDispatchOf<'scan-project'>): void {
  const src = dispatchTensor(ctx.bundle, record, 'inputs', 0);
  const xProjection = dispatchTensor(ctx.bundle, record, 'inputs', 1);
  const dtProjection = dispatchTensor(ctx.bundle, record, 'inputs', 2);
  const delta = dispatchTensor(ctx.bundle, record, 'outputs', 0);
  const b = dispatchTensor(ctx.bundle, record, 'outputs', 1);
  const c = dispatchTensor(ctx.bundle, record, 'outputs', 2);
  const shape = hwc4Shape(src);
  const positionCount = shape.width * shape.height;
  const scanProjectShape: ScanProjectShape = {
    width: shape.width,
    height: shape.height,
    logicalChannels: shape.channels,
    channelBlocks: shape.channelBlocks,
    rank: record.params.dtRank,
    positionCount,
  };
  const params = ctx.uniform(ScanProjectUniforms, {
    ...scanProjectShape,
    directionPositionCount: 4 * positionCount,
    xProjectionWeightBase: vec4Base(xProjection),
    dtProjectionWeightBase: vec4Base(dtProjection),
  });
  ctx.dispatches.push({
    pipeline: ctx.pipelineFor(`scan-project-${shapeKey(scanProjectShape)}`, () =>
      ctx.root.createComputePipeline({
        compute: createSpecializedScanProjectKernel(scanProjectShape),
      }),
    ),
    bindGroup: ctx.root.createBindGroup(scanProjectLayout, {
      params,
      src: ctx.arena.rawBufferFor(src.id),
      weights: sectionBinding(ctx.bundle, ctx.weights, xProjection),
      delta: ctx.arena.rawBufferFor(delta.id),
      b: ctx.arena.rawBufferFor(b.id),
      c: ctx.arena.rawBufferFor(c.id),
    }),
    workgroups: { x: positionCount, y: CROSS_SCAN_DIRECTION_COUNT },
  });
}

function buildSelectiveScan(ctx: DispatchContext, record: DepthDispatchOf<'selective-scan'>): void {
  const src = dispatchTensor(ctx.bundle, record, 'inputs', 0);
  const delta = dispatchTensor(ctx.bundle, record, 'inputs', 1);
  const b = dispatchTensor(ctx.bundle, record, 'inputs', 2);
  const c = dispatchTensor(ctx.bundle, record, 'inputs', 3);
  const a = dispatchTensor(ctx.bundle, record, 'inputs', 4);
  const skip = dispatchTensor(ctx.bundle, record, 'inputs', 5);
  const deltaBias = dispatchTensor(ctx.bundle, record, 'inputs', 6);
  const directional = dispatchTensor(ctx.bundle, record, 'outputs', 0);
  const shape = hwc4Shape(src);
  const positionCount = shape.width * shape.height;
  const params = ctx.uniform(SelectiveScanUniforms, {
    width: shape.width,
    height: shape.height,
    logicalChannels: shape.channels,
    channelBlocks: shape.channelBlocks,
    positionCount,
    sequenceCount: 4 * shape.channels,
    aBase: scalarBase(a),
    dBase: scalarBase(skip),
    deltaBiasBase: scalarBase(deltaBias),
  });
  ctx.dispatches.push({
    pipeline: ctx.pipelineFor('selective-scan', () =>
      ctx.root.createComputePipeline({ compute: sequentialSelectiveScanKernel }),
    ),
    bindGroup: ctx.root.createBindGroup(selectiveScanLayout, {
      params,
      src: ctx.arena.rawBufferFor(src.id),
      delta: ctx.arena.rawBufferFor(delta.id),
      b: ctx.arena.rawBufferFor(b.id),
      c: ctx.arena.rawBufferFor(c.id),
      a: sectionBinding(ctx.bundle, ctx.weights, a),
      d: sectionBinding(ctx.bundle, ctx.weights, skip),
      deltaBias: sectionBinding(ctx.bundle, ctx.weights, deltaBias),
      directionalDst: ctx.arena.rawBufferFor(directional.id),
    }),
    workgroups: { x: record.workgroups[0] },
  });
}

function buildScanMerge(ctx: DispatchContext, record: DepthDispatchOf<'scan-merge'>): void {
  const directional = dispatchTensor(ctx.bundle, record, 'inputs', 0);
  const dst = dispatchTensor(ctx.bundle, record, 'outputs', 0);
  const shape = hwc4Shape(dst);
  const params = ctx.uniform(CrossScanUniforms, {
    width: shape.width,
    height: shape.height,
    logicalChannels: shape.channels,
    channelBlocks: shape.channelBlocks,
    positionCount: shape.width * shape.height,
    elementCount: shape.elementCount,
  });
  ctx.dispatches.push({
    pipeline: ctx.pipelineFor('scan-merge', () =>
      ctx.root.createComputePipeline({ compute: crossMergeKernel }),
    ),
    bindGroup: ctx.root.createBindGroup(crossMergeLayout, {
      params,
      directionalSrc: ctx.arena.rawBufferFor(directional.id),
      dst: ctx.arena.rawBufferFor(dst.id),
    }),
    workgroups: { x: record.workgroups[0] },
  });
}
