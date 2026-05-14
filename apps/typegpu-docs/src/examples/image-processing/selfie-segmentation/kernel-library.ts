import { d } from 'typegpu';
import type { TgpuComputePipeline, TgpuRoot } from 'typegpu';
import { BroadcastFlag, type DispatchRecord, OpKind } from './bundle.ts';
import {
  activationSlot,
  addOp,
  binaryLayout,
  binaryOpSlot,
  binaryShapeAccess,
  convShapeAccess,
  hardSwishOp,
  headLayout,
  headShapeAccess,
  identityOp,
  mulOp,
  poolLayout,
  poolShapeAccess,
  reluOp,
  resizeShapeAccess,
  sigmoidOp,
  weightedLayout,
  weightedOffsets,
  type Vec4Op,
} from './kernel-layouts.ts';
import {
  binaryKernel,
  conv1x1Kernel,
  conv3x3Kernel,
  conv5x5Kernel,
  depthwise3x3Kernel,
  depthwise5x5Kernel,
  globalPoolKernel,
  head2x2SigmoidKernel,
  resize2xKernel,
} from './inference-kernels.ts';
import type {
  BinaryBuffers,
  HeadBuffers,
  KernelHandle,
  PackedWeightsBuffer,
  PoolBuffers,
  WeightedBuffers,
} from './kernel-types.ts';
import { WORKGROUP_SIZE } from './kernel-types.ts';

const activationOps = [identityOp, reluOp, hardSwishOp, sigmoidOp] as const;

export class SegmenterKernelLibrary {
  private readonly pipelines = new Map<bigint, TgpuComputePipeline>();

  constructor(
    private readonly root: TgpuRoot,
    private readonly weights: PackedWeightsBuffer,
  ) {}

  createConv(record: DispatchRecord, buffers: WeightedBuffers): KernelHandle {
    const shape = shapeForConv(record);
    const compute = convKernel(record);
    const pipeline = this.specializedPipeline(
      [
        record.opKind,
        ...record.kernel,
        ...record.stride,
        ...record.pad,
        ...record.input,
        ...record.output,
        record.activation,
      ],
      () =>
        this.root
          .with(convShapeAccess, shape)
          .with(activationSlot, activationOp(record.activation))
          .createComputePipeline({ compute }),
    );
    return this.weightedHandle(record, pipeline, buffers, shape.total);
  }

  createDepthwise(record: DispatchRecord, buffers: WeightedBuffers): KernelHandle {
    const shape = shapeForConv(record);
    const compute = depthwiseKernel(record);
    const pipeline = this.specializedPipeline(
      [
        record.opKind,
        ...record.kernel,
        ...record.stride,
        ...record.pad,
        ...record.input,
        ...record.output,
        record.activation,
      ],
      () =>
        this.root
          .with(convShapeAccess, shape)
          .with(activationSlot, activationOp(record.activation))
          .createComputePipeline({ compute }),
    );
    return this.weightedHandle(record, pipeline, buffers, shape.total);
  }

  createGlobalPool(record: DispatchRecord, buffers: PoolBuffers): KernelHandle {
    const shape = shapeForPool(record);
    const pipeline = this.specializedPipeline(
      [record.opKind, ...record.input, ...record.kernel],
      () =>
        this.root.with(poolShapeAccess, shape).createComputePipeline({ compute: globalPoolKernel }),
    );
    return {
      pipeline,
      bindGroup: this.root.createBindGroup(poolLayout, buffers),
      workgroups: shape.blocks,
    };
  }

  createResize2x(record: DispatchRecord, buffers: PoolBuffers): KernelHandle {
    const shape = shapeForResize(record);
    const pipeline = this.specializedPipeline(
      [record.opKind, ...record.input, ...record.output],
      () =>
        this.root.with(resizeShapeAccess, shape).createComputePipeline({ compute: resize2xKernel }),
    );
    return {
      pipeline,
      bindGroup: this.root.createBindGroup(poolLayout, buffers),
      workgroups: Math.ceil(shape.total / WORKGROUP_SIZE),
    };
  }

  createBinary(record: DispatchRecord, buffers: BinaryBuffers): KernelHandle {
    const shape = shapeForBinary(record);
    const pipeline = this.specializedPipeline([record.opKind, ...record.output, record.flags], () =>
      this.root
        .with(binaryShapeAccess, shape)
        .with(binaryOpSlot, record.opKind === OpKind.Mul ? mulOp : addOp)
        .createComputePipeline({ compute: binaryKernel }),
    );
    return {
      pipeline,
      bindGroup: this.root.createBindGroup(binaryLayout, buffers),
      workgroups: Math.ceil(shape.total / WORKGROUP_SIZE),
    };
  }

  createHead(record: DispatchRecord, buffers: HeadBuffers): KernelHandle {
    const shape = shapeForHead(record);
    const pipeline = this.specializedPipeline(
      [record.opKind, ...record.input, ...record.output],
      () =>
        this.root
          .with(headShapeAccess, shape)
          .createComputePipeline({ compute: head2x2SigmoidKernel }),
    );
    const offsets = this.root
      .createBuffer(weightedOffsets, {
        weightBase: record.weights,
        biasBase: record.bias,
      })
      .$usage('uniform');
    return {
      pipeline,
      bindGroup: this.root.createBindGroup(headLayout, {
        offsets,
        src: buffers.src,
        weights: this.weights,
        dst: buffers.dst,
      }),
      workgroups: Math.ceil(shape.total / WORKGROUP_SIZE),
    };
  }

  private specializedPipeline(
    keyParts: number[],
    create: () => TgpuComputePipeline,
  ): TgpuComputePipeline {
    const key = pipelineKey(keyParts);
    let pipeline = this.pipelines.get(key);
    if (!pipeline) {
      pipeline = create();
      this.pipelines.set(key, pipeline);
    }
    return pipeline;
  }

  private weightedHandle(
    record: DispatchRecord,
    pipeline: TgpuComputePipeline,
    buffers: WeightedBuffers,
    total: number,
  ): KernelHandle {
    const offsets = this.root
      .createBuffer(weightedOffsets, {
        weightBase: record.weights,
        biasBase: record.bias,
      })
      .$usage('uniform');
    return {
      pipeline,
      bindGroup: this.root.createBindGroup(weightedLayout, {
        offsets,
        src: buffers.src,
        weights: this.weights,
        dst: buffers.dst,
      }),
      workgroups: Math.ceil(total / WORKGROUP_SIZE),
    };
  }
}

function convKernel(record: DispatchRecord) {
  const [kernelW] = record.kernel;
  return kernelW === 1 ? conv1x1Kernel : kernelW === 3 ? conv3x3Kernel : conv5x5Kernel;
}

function depthwiseKernel(record: DispatchRecord) {
  return record.kernel[0] === 3 ? depthwise3x3Kernel : depthwise5x5Kernel;
}

function shapeForConv(record: DispatchRecord) {
  const [inputW, inputH, inputC] = record.input;
  const [outputW, outputH, outputC] = record.output;
  const [kernelW, kernelH] = record.kernel;
  const [strideW, strideH] = record.stride;
  const [padLeft, padTop] = record.pad;
  return {
    input: d.vec3u(inputW, inputH, inputC),
    output: d.vec3u(outputW, outputH, outputC),
    blocks: d.vec2u(c4(inputC), c4(outputC)),
    kernel: d.vec2u(kernelW, kernelH),
    stride: d.vec2u(strideW, strideH),
    pad: d.vec2u(padLeft, padTop),
    total: outputH * outputW * c4(outputC),
  };
}

function shapeForPool(record: DispatchRecord) {
  const [inputW, inputH, inputC] = record.input;
  const [, , outputC] = record.output;
  const [kernelW, kernelH] = record.kernel;
  return {
    input: d.vec3u(inputW, inputH, inputC),
    blocks: c4(outputC),
    window: d.vec2u(kernelW, kernelH),
  };
}

function shapeForResize(record: DispatchRecord) {
  const [inputW, inputH, inputC] = record.input;
  const [outputW, outputH, outputC] = record.output;
  return {
    input: d.vec3u(inputW, inputH, inputC),
    output: d.vec3u(outputW, outputH, outputC),
    blocks: c4(outputC),
    total: outputH * outputW * c4(outputC),
  };
}

function shapeForBinary(record: DispatchRecord) {
  const [outputW, outputH, outputC] = record.output;
  const outputBlocks = c4(outputC);
  return {
    output: d.vec3u(outputW, outputH, outputC),
    outputBlocks,
    bShape: d.vec2u(
      (record.flags & BroadcastFlag.W) !== 0 ? 1 : outputW,
      (record.flags & BroadcastFlag.C) !== 0 ? 1 : outputBlocks,
    ),
    flags: record.flags,
    total: outputH * outputW * outputBlocks,
  };
}

function shapeForHead(record: DispatchRecord) {
  const [inputW, inputH, inputC] = record.input;
  const [outputW, outputH, outputC] = record.output;
  return {
    input: d.vec3u(inputW, inputH, inputC),
    output: d.vec3u(outputW, outputH, outputC),
    inputBlocks: c4(inputC),
    total: inputH * inputW,
  };
}

function activationOp(kind: number): Vec4Op {
  return activationOps[kind] as Vec4Op;
}

function c4(channels: number): number {
  return Math.ceil(channels / 4);
}

function pipelineKey(parts: number[]): bigint {
  let hash = 0xcbf29ce484222325n;
  for (const part of parts) {
    hash ^= BigInt.asUintN(64, BigInt(part));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash;
}
