import tgpu, { d, std } from 'typegpu';
import type {
  StorageFlag,
  TgpuBindGroup,
  TgpuBuffer,
  TgpuComputePipeline,
  TgpuRoot,
} from 'typegpu';
import { BroadcastFlag, type DispatchRecord, OpKind } from './bundle.ts';
import { hwc4Index, sigmoidScalar } from './shader-utils.ts';

export const WORKGROUP_SIZE = 64;

export type Vec4Buffer = TgpuBuffer<d.WgslArray<d.Vec4f>> & StorageFlag;

export interface KernelHandle {
  pipeline: TgpuComputePipeline;
  bindGroup: TgpuBindGroup;
  workgroups: number;
}

interface WeightedBuffers {
  src: Vec4Buffer;
  dst: Vec4Buffer;
}

interface BinaryBuffers {
  a: Vec4Buffer;
  b: Vec4Buffer;
  dst: Vec4Buffer;
}

interface PoolBuffers {
  src: Vec4Buffer;
  dst: Vec4Buffer;
}

const weightedOffsets = d.struct({
  weightBase: d.u32,
  biasBase: d.u32,
});

const convShape = d.struct({
  input: d.vec3u,
  output: d.vec3u,
  blocks: d.vec2u,
  kernel: d.vec2u,
  stride: d.vec2u,
  pad: d.vec2u,
  total: d.u32,
});

const binaryShape = d.struct({
  output: d.vec3u,
  outputBlocks: d.u32,
  bShape: d.vec2u,
  flags: d.u32,
  total: d.u32,
});

const poolShape = d.struct({
  input: d.vec3u,
  blocks: d.u32,
  window: d.vec2u,
});

const resizeShape = d.struct({
  input: d.vec3u,
  output: d.vec3u,
  blocks: d.u32,
  total: d.u32,
});

const headShape = d.struct({
  input: d.vec3u,
  output: d.vec3u,
  inputBlocks: d.u32,
  total: d.u32,
});

export const convShapeAccess = tgpu.accessor(convShape, {
  input: d.vec3u(1),
  output: d.vec3u(1),
  blocks: d.vec2u(1),
  kernel: d.vec2u(1),
  stride: d.vec2u(1),
  pad: d.vec2u(0),
  total: 1,
});

export const binaryShapeAccess = tgpu.accessor(binaryShape, {
  output: d.vec3u(1),
  outputBlocks: 1,
  bShape: d.vec2u(1),
  flags: 0,
  total: 1,
});

export const poolShapeAccess = tgpu.accessor(poolShape, {
  input: d.vec3u(1),
  blocks: 1,
  window: d.vec2u(1),
});

export const resizeShapeAccess = tgpu.accessor(resizeShape, {
  input: d.vec3u(1),
  output: d.vec3u(1),
  blocks: 1,
  total: 1,
});

export const headShapeAccess = tgpu.accessor(headShape, {
  input: d.vec3u(1),
  output: d.vec3u(1),
  inputBlocks: 1,
  total: 1,
});

export const weightedLayout = tgpu.bindGroupLayout({
  offsets: { uniform: weightedOffsets },
  src: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  weights: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  dst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

export const binaryLayout = tgpu.bindGroupLayout({
  a: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  b: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  dst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

export const poolLayout = tgpu.bindGroupLayout({
  src: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  dst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

type Vec4Op = (value: d.v4f) => d.v4f;
type BinaryOp = (a: d.v4f, b: d.v4f) => d.v4f;

const identityOp = (value: d.v4f) => {
  'use gpu';
  return d.vec4f(value);
};

const reluOp = (value: d.v4f) => {
  'use gpu';
  return std.max(value, d.vec4f(0));
};

const hardSwishOp = (value: d.v4f) => {
  'use gpu';
  return value * std.saturate((value + 3) / 6);
};

const sigmoidOp = (value: d.v4f) => {
  'use gpu';
  return d.vec4f(1) / (d.vec4f(1) + std.exp(-value));
};

const addOp = (a: d.v4f, b: d.v4f) => {
  'use gpu';
  return a + b;
};

const mulOp = (a: d.v4f, b: d.v4f) => {
  'use gpu';
  return a * b;
};

export const activationSlot = tgpu.slot<Vec4Op>(identityOp);
export const binaryOpSlot = tgpu.slot<BinaryOp>(addOp);

const poolWorkgroupSums = tgpu.workgroupVar(d.arrayOf(d.vec4f, WORKGROUP_SIZE));

const packedDot4 = (value: d.v4f, weightBase: number) => {
  'use gpu';
  return d.vec4f(
    std.dot(value, weightedLayout.$.weights[weightBase]),
    std.dot(value, weightedLayout.$.weights[weightBase + 1]),
    std.dot(value, weightedLayout.$.weights[weightBase + 2]),
    std.dot(value, weightedLayout.$.weights[weightBase + 3]),
  );
};

export const conv1x1Kernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const shape = convShapeAccess.$;
  const i = gid.x;
  if (i >= shape.total) {
    return;
  }

  const outBlock = i % shape.blocks.y;
  const pixel = d.u32(i / shape.blocks.y);
  const outX = pixel % shape.output.x;
  const outY = d.u32(pixel / shape.output.x);
  let acc = d.vec4f(weightedLayout.$.weights[weightedLayout.$.offsets.biasBase + outBlock]);

  let inBlock = d.u32(0);
  while (inBlock < shape.blocks.x) {
    const value =
      weightedLayout.$.src[hwc4Index(outY, outX, inBlock, shape.input.x, shape.blocks.x)];
    const weightBase =
      weightedLayout.$.offsets.weightBase + (outBlock * shape.blocks.x + inBlock) * 4;
    acc += packedDot4(value, weightBase);
    inBlock += 1;
  }

  weightedLayout.$.dst[i] = activationSlot.$(acc);
});

export const convKxKKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const shape = convShapeAccess.$;
  const i = gid.x;
  if (i >= shape.total) {
    return;
  }

  const outBlock = i % shape.blocks.y;
  const pixel = d.u32(i / shape.blocks.y);
  const outX = pixel % shape.output.x;
  const outY = d.u32(pixel / shape.output.x);
  let acc = d.vec4f(weightedLayout.$.weights[weightedLayout.$.offsets.biasBase + outBlock]);

  for (const ky of tgpu.unroll([0, 1, 2, 3, 4])) {
    const kernelY = d.u32(ky);
    if (kernelY < shape.kernel.y) {
      const paddedY = outY * shape.stride.y + kernelY;
      if (paddedY >= shape.pad.y) {
        const inY = paddedY - shape.pad.y;
        if (inY < shape.input.y) {
          for (const kx of tgpu.unroll([0, 1, 2, 3, 4])) {
            const kernelX = d.u32(kx);
            if (kernelX < shape.kernel.x) {
              const paddedX = outX * shape.stride.x + kernelX;
              if (paddedX >= shape.pad.x) {
                const inX = paddedX - shape.pad.x;
                if (inX < shape.input.x) {
                  let inBlock = d.u32(0);
                  while (inBlock < shape.blocks.x) {
                    const value =
                      weightedLayout.$.src[
                        hwc4Index(inY, inX, inBlock, shape.input.x, shape.blocks.x)
                      ];
                    const weightBase =
                      weightedLayout.$.offsets.weightBase +
                      ((outBlock * shape.kernel.y + kernelY) * shape.kernel.x + kernelX) *
                        shape.blocks.x *
                        4 +
                      inBlock * 4;
                    acc += packedDot4(value, weightBase);
                    inBlock += 1;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  weightedLayout.$.dst[i] = activationSlot.$(acc);
});

export const depthwise3x3Kernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const shape = convShapeAccess.$;
  const i = gid.x;
  if (i >= shape.total) {
    return;
  }

  const block = i % shape.blocks.y;
  const pixel = d.u32(i / shape.blocks.y);
  const outX = pixel % shape.output.x;
  const outY = d.u32(pixel / shape.output.x);
  let acc = d.vec4f(weightedLayout.$.weights[weightedLayout.$.offsets.biasBase + block]);

  for (const ky of tgpu.unroll([0, 1, 2])) {
    const kernelY = d.u32(ky);
    const paddedY = outY * shape.stride.y + kernelY;
    if (paddedY >= shape.pad.y) {
      const inY = paddedY - shape.pad.y;
      if (inY < shape.input.y) {
        for (const kx of tgpu.unroll([0, 1, 2])) {
          const kernelX = d.u32(kx);
          const paddedX = outX * shape.stride.x + kernelX;
          if (paddedX >= shape.pad.x) {
            const inX = paddedX - shape.pad.x;
            if (inX < shape.input.x) {
              const value =
                weightedLayout.$.src[hwc4Index(inY, inX, block, shape.input.x, shape.blocks.x)];
              const weightIndex =
                weightedLayout.$.offsets.weightBase + block * 9 + d.u32(ky * 3 + kx);
              acc += value * weightedLayout.$.weights[weightIndex];
            }
          }
        }
      }
    }
  }

  weightedLayout.$.dst[i] = activationSlot.$(acc);
});

export const depthwiseKxKKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const shape = convShapeAccess.$;
  const i = gid.x;
  if (i >= shape.total) {
    return;
  }

  const block = i % shape.blocks.y;
  const pixel = d.u32(i / shape.blocks.y);
  const outX = pixel % shape.output.x;
  const outY = d.u32(pixel / shape.output.x);
  let acc = d.vec4f(weightedLayout.$.weights[weightedLayout.$.offsets.biasBase + block]);

  for (const ky of tgpu.unroll([0, 1, 2, 3, 4])) {
    const kernelY = d.u32(ky);
    if (kernelY < shape.kernel.y) {
      const paddedY = outY * shape.stride.y + kernelY;
      if (paddedY >= shape.pad.y) {
        const inY = paddedY - shape.pad.y;
        if (inY < shape.input.y) {
          for (const kx of tgpu.unroll([0, 1, 2, 3, 4])) {
            const kernelX = d.u32(kx);
            if (kernelX < shape.kernel.x) {
              const paddedX = outX * shape.stride.x + kernelX;
              if (paddedX >= shape.pad.x) {
                const inX = paddedX - shape.pad.x;
                if (inX < shape.input.x) {
                  const value =
                    weightedLayout.$.src[hwc4Index(inY, inX, block, shape.input.x, shape.blocks.x)];
                  const weightIndex =
                    weightedLayout.$.offsets.weightBase +
                    block * shape.kernel.y * shape.kernel.x +
                    kernelY * shape.kernel.x +
                    kernelX;
                  acc += value * weightedLayout.$.weights[weightIndex];
                }
              }
            }
          }
        }
      }
    }
  }

  weightedLayout.$.dst[i] = activationSlot.$(acc);
});

export const globalPoolKernel = tgpu.computeFn({
  in: {
    localIndex: d.builtin.localInvocationIndex,
    workgroupId: d.builtin.workgroupId,
  },
  workgroupSize: [WORKGROUP_SIZE],
})(({ localIndex, workgroupId }) => {
  'use gpu';
  const shape = poolShapeAccess.$;
  const block = workgroupId.x;
  let sum = d.vec4f(0);
  let offset = localIndex;
  const pixels = shape.window.x * shape.window.y;

  while (offset < pixels) {
    const y = d.u32(offset / shape.window.x);
    const x = offset % shape.window.x;
    sum += poolLayout.$.src[hwc4Index(y, x, block, shape.input.x, shape.blocks)];
    offset += WORKGROUP_SIZE;
  }

  poolWorkgroupSums.$[localIndex] = d.vec4f(sum);
  std.workgroupBarrier();

  let stride = d.u32(WORKGROUP_SIZE / 2);
  while (stride > 0) {
    if (localIndex < stride) {
      poolWorkgroupSums.$[localIndex] += poolWorkgroupSums.$[localIndex + stride];
    }
    std.workgroupBarrier();
    stride = d.u32(stride / 2);
  }

  if (localIndex === 0) {
    poolLayout.$.dst[block] = poolWorkgroupSums.$[0] / d.f32(pixels);
  }
});

export const resize2xKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const shape = resizeShapeAccess.$;
  const i = gid.x;
  if (i >= shape.total) {
    return;
  }

  const block = i % shape.blocks;
  const pixel = d.u32(i / shape.blocks);
  const outX = pixel % shape.output.x;
  const outY = d.u32(pixel / shape.output.x);
  const src = d.vec2f(outX, outY) * 0.5 - 0.25;
  const base = std.floor(src);
  const lerp = src - base;
  const maxCoord = d.vec2f(shape.input.xy) - d.vec2f(1);
  const p0 = d.vec2u(std.clamp(base, d.vec2f(0), maxCoord));
  const p1 = d.vec2u(std.clamp(base + 1, d.vec2f(0), maxCoord));
  const top = std.mix(
    poolLayout.$.src[hwc4Index(p0.y, p0.x, block, shape.input.x, shape.blocks)],
    poolLayout.$.src[hwc4Index(p0.y, p1.x, block, shape.input.x, shape.blocks)],
    lerp.x,
  );
  const bottom = std.mix(
    poolLayout.$.src[hwc4Index(p1.y, p0.x, block, shape.input.x, shape.blocks)],
    poolLayout.$.src[hwc4Index(p1.y, p1.x, block, shape.input.x, shape.blocks)],
    lerp.x,
  );
  poolLayout.$.dst[i] = std.mix(top, bottom, lerp.y);
});

export const binaryKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const shape = binaryShapeAccess.$;
  const i = gid.x;
  if (i >= shape.total) {
    return;
  }

  const block = i % shape.outputBlocks;
  const pixel = d.u32(i / shape.outputBlocks);
  const outX = pixel % shape.output.x;
  const outY = d.u32(pixel / shape.output.x);
  let bY = outY;
  if ((shape.flags & BroadcastFlag.H) !== 0) {
    bY = 0;
  }
  let bX = outX;
  if ((shape.flags & BroadcastFlag.W) !== 0) {
    bX = 0;
  }
  let bBlock = block;
  if ((shape.flags & BroadcastFlag.C) !== 0) {
    bBlock = 0;
  }

  const a = binaryLayout.$.a[i];
  let b = d.vec4f(binaryLayout.$.b[hwc4Index(bY, bX, bBlock, shape.bShape.x, shape.bShape.y)]);
  if ((shape.flags & BroadcastFlag.C) !== 0) {
    b = d.vec4f(b.x);
  }
  binaryLayout.$.dst[i] = binaryOpSlot.$(a, b);
});

export const head2x2SigmoidKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const shape = headShapeAccess.$;
  const i = gid.x;
  if (i >= shape.total) {
    return;
  }

  const inX = i % shape.input.x;
  const inY = d.u32(i / shape.input.x);
  const bias = weightedLayout.$.weights[weightedLayout.$.offsets.biasBase].x;

  for (const ky of tgpu.unroll([0, 1])) {
    for (const kx of tgpu.unroll([0, 1])) {
      let sum = bias;
      const spatial = d.u32(ky * 2 + kx);
      let inBlock = d.u32(0);
      while (inBlock < shape.inputBlocks) {
        const value =
          weightedLayout.$.src[hwc4Index(inY, inX, inBlock, shape.input.x, shape.inputBlocks)];
        const weight =
          weightedLayout.$.weights[
            weightedLayout.$.offsets.weightBase + spatial * shape.inputBlocks + inBlock
          ];
        sum += std.dot(value, weight);
        inBlock += 1;
      }

      const outX = inX * 2 + d.u32(kx);
      const outY = inY * 2 + d.u32(ky);
      const outIndex = outY * shape.output.x + outX;
      weightedLayout.$.dst[outIndex] = d.vec4f(sigmoidScalar(sum), 0, 0, 0);
    }
  }
});

export class SegmenterKernelLibrary {
  private readonly pipelines = new Map<bigint, TgpuComputePipeline>();

  constructor(
    private readonly root: TgpuRoot,
    private readonly weights: Vec4Buffer,
  ) {}

  createConv(record: DispatchRecord, buffers: WeightedBuffers): KernelHandle {
    const shape = shapeForConv(record);
    const [kernelW, kernelH] = record.kernel;
    const compute = kernelW === 1 && kernelH === 1 ? conv1x1Kernel : convKxKKernel;
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
    const [kernelW, kernelH] = record.kernel;
    const compute = kernelW === 3 && kernelH === 3 ? depthwise3x3Kernel : depthwiseKxKKernel;
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
    const [inputW, inputH] = record.input;
    const [outputW, outputH] = record.output;
    const [kernelW, kernelH] = record.kernel;
    if (outputW !== 1 || outputH !== 1 || kernelW !== inputW || kernelH !== inputH) {
      throw new Error('SSG1 average pool records must be fixed global pools.');
    }
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

  createHead(record: DispatchRecord, buffers: WeightedBuffers): KernelHandle {
    const shape = shapeForHead(record);
    const pipeline = this.specializedPipeline(
      [record.opKind, ...record.input, ...record.output],
      () =>
        this.root
          .with(headShapeAccess, shape)
          .createComputePipeline({ compute: head2x2SigmoidKernel }),
    );
    return this.weightedHandle(record, pipeline, buffers, shape.total);
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
    const [weightOffset] = record.weights;
    const [biasOffset] = record.bias;
    const offsets = this.root
      .createBuffer(weightedOffsets, {
        weightBase: weightOffset / 16,
        biasBase: biasOffset / 16,
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
  switch (kind) {
    case 0:
      return identityOp;
    case 1:
      return reluOp;
    case 2:
      return hardSwishOp;
    case 3:
      return sigmoidOp;
    default:
      throw new Error(`Unsupported fused activation kind ${kind}.`);
  }
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
