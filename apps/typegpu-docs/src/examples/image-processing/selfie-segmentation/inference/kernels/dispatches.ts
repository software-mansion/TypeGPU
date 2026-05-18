import { d } from 'typegpu';
import type { TgpuComputePipeline, TgpuRoot } from 'typegpu';
import { BroadcastFlag, type DispatchRecord, OpKind, type Activation } from '../bundle.ts';
import {
  type KernelHandle,
  type MaskBuffer,
  type PackedWeightsBuffer,
  type Vec4Buffer,
  WORKGROUP_SIZE,
} from './types.ts';
import {
  activationSlot,
  addOp,
  binaryLayout,
  binaryOpSlot,
  binaryShapeSlot,
  convShapeSlot,
  hardSwishOp,
  headLayout,
  headShapeSlot,
  identityOp,
  mulOp,
  poolLayout,
  poolShapeSlot,
  reluOp,
  resizeShapeSlot,
  sigmoidOp,
  weightedLayout,
  weightedOffsets,
  type Vec4Op,
} from './layouts.ts';
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
} from './compute.ts';

const activationOps = [identityOp, reluOp, hardSwishOp, sigmoidOp] as const;

export function createSegmenterDispatches(
  root: TgpuRoot,
  records: readonly DispatchRecord[],
  slots: readonly Vec4Buffer[],
  mask: MaskBuffer,
  weights: PackedWeightsBuffer,
): KernelHandle[] {
  const pipelines = new Map<bigint, TgpuComputePipeline>();

  const specializedPipeline = (keyParts: number[], create: () => TgpuComputePipeline) => {
    const key = pipelineKey(keyParts);
    let pipeline = pipelines.get(key);
    if (!pipeline) {
      pipeline = create();
      pipelines.set(key, pipeline);
    }
    return pipeline;
  };

  const weightedHandle = (
    record: DispatchRecord,
    pipeline: TgpuComputePipeline,
    src: Vec4Buffer,
    dst: Vec4Buffer,
    total: number,
  ): KernelHandle => {
    const offsets = root
      .createBuffer(weightedOffsets, {
        weightBase: record.weights,
        biasBase: record.bias,
      })
      .$usage('uniform');
    return {
      pipeline,
      bindGroup: root.createBindGroup(weightedLayout, {
        offsets,
        src,
        weights,
        dst,
      }),
      workgroups: Math.ceil(total / WORKGROUP_SIZE),
    };
  };

  const convHandle = (record: DispatchRecord, compute: typeof conv1x1Kernel) => {
    const [srcA, , dst] = record.slots;
    const shape = shapeForConv(record);
    const pipeline = specializedPipeline(
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
        root
          .with(convShapeSlot, shape)
          .with(activationSlot, activationOp(record.activation))
          .createComputePipeline({ compute }),
    );
    return weightedHandle(record, pipeline, slots[srcA], slots[dst], shape.total);
  };

  return records.map((record) => {
    const [srcA, srcB, dst] = record.slots;
    switch (record.opKind) {
      case OpKind.Conv:
        return convHandle(record, convKernel(record));
      case OpKind.DwConv:
        return convHandle(record, depthwiseKernel(record));
      case OpKind.AvgPool: {
        const shape = shapeForPool(record);
        const pipeline = specializedPipeline(
          [record.opKind, ...record.input, ...record.kernel],
          () =>
            root.with(poolShapeSlot, shape).createComputePipeline({ compute: globalPoolKernel }),
        );
        return {
          pipeline,
          bindGroup: root.createBindGroup(poolLayout, {
            src: slots[srcA],
            dst: slots[dst],
          }),
          workgroups: shape.blocks,
        };
      }
      case OpKind.Resize2x: {
        const shape = shapeForResize(record);
        const pipeline = specializedPipeline(
          [record.opKind, ...record.input, ...record.output],
          () =>
            root.with(resizeShapeSlot, shape).createComputePipeline({ compute: resize2xKernel }),
        );
        return {
          pipeline,
          bindGroup: root.createBindGroup(poolLayout, {
            src: slots[srcA],
            dst: slots[dst],
          }),
          workgroups: Math.ceil(shape.total / WORKGROUP_SIZE),
        };
      }
      case OpKind.Add:
      case OpKind.Mul: {
        const shape = shapeForBinary(record);
        const pipeline = specializedPipeline([record.opKind, ...record.output, record.flags], () =>
          root
            .with(binaryShapeSlot, shape)
            .with(binaryOpSlot, record.opKind === OpKind.Mul ? mulOp : addOp)
            .createComputePipeline({ compute: binaryKernel }),
        );
        return {
          pipeline,
          bindGroup: root.createBindGroup(binaryLayout, {
            a: slots[srcA],
            b: slots[srcB],
            dst: slots[dst],
          }),
          workgroups: Math.ceil(shape.total / WORKGROUP_SIZE),
        };
      }
      case OpKind.Head: {
        const shape = shapeForHead(record);
        const pipeline = specializedPipeline(
          [record.opKind, ...record.input, ...record.output],
          () =>
            root
              .with(headShapeSlot, shape)
              .createComputePipeline({ compute: head2x2SigmoidKernel }),
        );
        const offsets = root
          .createBuffer(weightedOffsets, {
            weightBase: record.weights,
            biasBase: record.bias,
          })
          .$usage('uniform');
        return {
          pipeline,
          bindGroup: root.createBindGroup(headLayout, {
            offsets,
            src: slots[srcA],
            weights,
            dst: mask,
          }),
          workgroups: Math.ceil(shape.total / WORKGROUP_SIZE),
        };
      }
    }
  });
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

function activationOp(kind: Activation): Vec4Op {
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
