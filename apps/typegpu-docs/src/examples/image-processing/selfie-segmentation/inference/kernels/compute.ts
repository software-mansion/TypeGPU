import { tgpu, d, std } from 'typegpu';
import { BroadcastFlag } from '../bundle.ts';
import {
  binaryLayout,
  binaryShapeConst,
  convShapeConst,
  headLayout,
  headShapeConst,
  poolLayout,
  poolShapeConst,
  resizeShapeConst,
  weightedLayout,
} from './layouts.ts';
import {
  activationSlot,
  binaryOpSlot,
  blockedPixel,
  hwc4Index,
  inputCoord,
  outOfBounds,
  packedDot4,
  packedHeadWeightAt,
  packedWeightAt,
  sigmoidScalar,
} from './helpers.ts';
import { WORKGROUP_SIZE } from './types.ts';

const KERNEL_3 = [0, 1, 2] as const;
const KERNEL_5 = [0, 1, 2, 3, 4] as const;

export const conv1x1Kernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const shape = convShapeConst.$;
  const i = gid.x;
  if (i >= shape.total) {
    return;
  }

  const out = blockedPixel(i, shape.output.x, shape.blocks.y);
  let acc = d.vec4f(packedWeightAt(weightedLayout.$.offsets.biasBase + out.z));

  let inBlock = d.u32(0);
  while (inBlock < shape.blocks.x) {
    const value =
      weightedLayout.$.src[hwc4Index(out.y, out.x, inBlock, shape.input.x, shape.blocks.x)];
    const weightBase = weightedLayout.$.offsets.weightBase + (out.z * shape.blocks.x + inBlock) * 4;
    acc += packedDot4(value, weightBase);
    inBlock += 1;
  }

  weightedLayout.$.dst[i] = activationSlot.$(acc);
});

const createConvKernel = (taps: readonly number[], kernelSize: number) =>
  tgpu.computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [WORKGROUP_SIZE],
  })(({ gid }) => {
    'use gpu';
    const shape = convShapeConst.$;
    const i = gid.x;
    if (i >= shape.total) {
      return;
    }

    const out = blockedPixel(i, shape.output.x, shape.blocks.y);
    let acc = d.vec4f(packedWeightAt(weightedLayout.$.offsets.biasBase + out.z));

    for (const ky of tgpu.unroll(taps)) {
      const kernelY = d.u32(ky);
      const inY = inputCoord(out.y, kernelY, shape.stride.y, shape.pad.y);
      if (!outOfBounds(inY, shape.input.y)) {
        for (const kx of tgpu.unroll(taps)) {
          const kernelX = d.u32(kx);
          const inX = inputCoord(out.x, kernelX, shape.stride.x, shape.pad.x);
          if (!outOfBounds(inX, shape.input.x)) {
            let inBlock = d.u32(0);
            while (inBlock < shape.blocks.x) {
              const value =
                weightedLayout.$.src[
                  hwc4Index(d.u32(inY), d.u32(inX), inBlock, shape.input.x, shape.blocks.x)
                ];
              const weightBase =
                weightedLayout.$.offsets.weightBase +
                ((out.z * kernelSize + kernelY) * kernelSize + kernelX) * shape.blocks.x * 4 +
                inBlock * 4;
              acc += packedDot4(value, weightBase);
              inBlock += 1;
            }
          }
        }
      }
    }

    weightedLayout.$.dst[i] = activationSlot.$(acc);
  });

const createDepthwiseKernel = (taps: readonly number[], kernelSize: number) =>
  tgpu.computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [WORKGROUP_SIZE],
  })(({ gid }) => {
    'use gpu';
    const shape = convShapeConst.$;
    const i = gid.x;
    if (i >= shape.total) {
      return;
    }

    const out = blockedPixel(i, shape.output.x, shape.blocks.y);
    let acc = d.vec4f(packedWeightAt(weightedLayout.$.offsets.biasBase + out.z));

    for (const ky of tgpu.unroll(taps)) {
      const kernelY = d.u32(ky);
      const inY = inputCoord(out.y, kernelY, shape.stride.y, shape.pad.y);
      if (!outOfBounds(inY, shape.input.y)) {
        for (const kx of tgpu.unroll(taps)) {
          const kernelX = d.u32(kx);
          const inX = inputCoord(out.x, kernelX, shape.stride.x, shape.pad.x);
          if (!outOfBounds(inX, shape.input.x)) {
            const value =
              weightedLayout.$.src[
                hwc4Index(d.u32(inY), d.u32(inX), out.z, shape.input.x, shape.blocks.x)
              ];
            const weightIndex =
              weightedLayout.$.offsets.weightBase +
              out.z * (kernelSize * kernelSize) +
              d.u32(ky * kernelSize + kx);
            acc = std.fma(value, packedWeightAt(weightIndex), acc);
          }
        }
      }
    }

    weightedLayout.$.dst[i] = activationSlot.$(acc);
  });

export const conv3x3Kernel = createConvKernel(KERNEL_3, 3);
export const conv5x5Kernel = createConvKernel(KERNEL_5, 5);
export const depthwise3x3Kernel = createDepthwiseKernel(KERNEL_3, 3);
export const depthwise5x5Kernel = createDepthwiseKernel(KERNEL_5, 5);

const poolWorkgroupSums = tgpu.workgroupVar(d.arrayOf(d.vec4f, WORKGROUP_SIZE));

export const globalPoolKernel = tgpu.computeFn({
  in: {
    localIndex: d.builtin.localInvocationIndex,
    workgroupId: d.builtin.workgroupId,
  },
  workgroupSize: [WORKGROUP_SIZE],
})(({ localIndex, workgroupId }) => {
  'use gpu';
  const shape = poolShapeConst.$;
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
    poolLayout.$.dst[block] = poolWorkgroupSums.$[0] / pixels;
  }
});

export const resize2xKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const shape = resizeShapeConst.$;
  const i = gid.x;
  if (i >= shape.total) {
    return;
  }

  const block = i % shape.blocks;
  const pixel = d.u32(i / shape.blocks);
  const out = d.vec2u(pixel % shape.output.x, d.u32(pixel / shape.output.x));
  const src = d.vec2f(out) * 0.5 - 0.25;
  const base = std.floor(src);
  const lerp = src - base;
  const maxCoord = d.vec2f(shape.input.xy) - 1;
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
  const shape = binaryShapeConst.$;
  const i = gid.x;
  if (i >= shape.total) {
    return;
  }

  const block = i % shape.outputBlocks;
  const pixel = d.u32(i / shape.outputBlocks);
  const out = d.vec2u(pixel % shape.output.x, d.u32(pixel / shape.output.x));

  let bY = out.y;
  if ((shape.flags & BroadcastFlag.H) !== 0) {
    bY = 0;
  }

  let bX = out.x;
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
  const shape = headShapeConst.$;
  const i = gid.x;
  if (i >= shape.total) {
    return;
  }

  const inputPixel = d.vec2u(i % shape.input.x, d.u32(i / shape.input.x));
  const bias = packedHeadWeightAt(headLayout.$.offsets.biasBase).x;

  for (const ky of tgpu.unroll([0, 1])) {
    for (const kx of tgpu.unroll([0, 1])) {
      let sum = bias;
      const spatial = d.u32(ky * 2 + kx);
      let inBlock = d.u32(0);
      while (inBlock < shape.inputBlocks) {
        const value =
          headLayout.$.src[
            hwc4Index(inputPixel.y, inputPixel.x, inBlock, shape.input.x, shape.inputBlocks)
          ];
        const weight = packedHeadWeightAt(
          headLayout.$.offsets.weightBase + spatial * shape.inputBlocks + inBlock,
        );
        sum += std.dot(value, weight);
        inBlock += 1;
      }

      const out = inputPixel * 2 + d.vec2u(kx, ky);
      const outIndex = out.y * shape.output.x + out.x;
      headLayout.$.dst[outIndex] = sigmoidScalar(sum);
    }
  }
});
