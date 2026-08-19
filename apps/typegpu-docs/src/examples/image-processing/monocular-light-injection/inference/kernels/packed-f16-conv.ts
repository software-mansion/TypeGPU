import { d, std, tgpu } from 'typegpu';
import {
  activationSlot,
  blockedElement,
  coordinateOutOfBounds,
  hwc4Index,
  inputCoordinate,
  maskPaddedChannels,
} from './helpers.ts';
import { packedF16DepthwiseConvLayout } from './layouts.ts';
import { DEPTH_KERNEL_WORKGROUP_SIZE } from './types.ts';

const packedDepthwiseWeightAt = (logicalVec4Index: number) => {
  'use gpu';
  const params = packedF16DepthwiseConvLayout.$.params;
  const wordBase = params.weightBase * 4 + logicalVec4Index * 2;
  const xy = std.unpack2x16float(packedF16DepthwiseConvLayout.$.weights[wordBase]);
  const zw = std.unpack2x16float(packedF16DepthwiseConvLayout.$.weights[wordBase + 1]);
  return d.vec4f(xy, zw);
};

/** Packed-FP16 depthwise 3x3 convolution with FP32 accumulation */
export const packedF16Depthwise3x3Kernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_KERNEL_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const index = gid.x;
  const params = packedF16DepthwiseConvLayout.$.params;
  if (index >= params.elementCount) {
    return;
  }

  const output = blockedElement(index, params.outputWidth, params.channelBlocks);
  let accumulator = d.vec4f(packedF16DepthwiseConvLayout.$.bias[params.biasBase + output.z]);
  for (const ky of tgpu.unroll([0, 1, 2])) {
    const inputY = inputCoordinate(output.y, ky, params.strideY, params.padY);
    if (!coordinateOutOfBounds(inputY, params.inputHeight)) {
      for (const kx of tgpu.unroll([0, 1, 2])) {
        const inputX = inputCoordinate(output.x, kx, params.strideX, params.padX);
        if (!coordinateOutOfBounds(inputX, params.inputWidth)) {
          const value =
            packedF16DepthwiseConvLayout.$.src[
              hwc4Index(
                d.u32(inputY),
                d.u32(inputX),
                output.z,
                params.inputWidth,
                params.channelBlocks,
              )
            ];
          const logicalWeight = output.z * 9 + ky * 3 + kx;
          accumulator = std.fma(value, packedDepthwiseWeightAt(logicalWeight), accumulator);
        }
      }
    }
  }

  packedF16DepthwiseConvLayout.$.dst[index] = maskPaddedChannels(
    activationSlot.$(accumulator),
    output.z,
    params.logicalChannels,
  );
});

const packedF16AxisConvolution = (index: number, horizontal: boolean) => {
  'use gpu';
  const params = packedF16DepthwiseConvLayout.$.params;
  const output = blockedElement(index, params.outputWidth, params.channelBlocks);
  let accumulator = d.vec4f(packedF16DepthwiseConvLayout.$.bias[params.biasBase + output.z]);

  for (let tap = d.u32(0); tap < params.kernelLength; tap += 1) {
    let inputX = inputCoordinate(output.x, 0, params.strideX, params.padX);
    let inputY = inputCoordinate(output.y, 0, params.strideY, params.padY);
    if (horizontal) {
      inputX = inputCoordinate(output.x, tap, params.strideX, params.padX);
    } else {
      inputY = inputCoordinate(output.y, tap, params.strideY, params.padY);
    }

    if (
      !coordinateOutOfBounds(inputX, params.inputWidth) &&
      !coordinateOutOfBounds(inputY, params.inputHeight)
    ) {
      const value =
        packedF16DepthwiseConvLayout.$.src[
          hwc4Index(d.u32(inputY), d.u32(inputX), output.z, params.inputWidth, params.channelBlocks)
        ];
      const logicalWeight = output.z * params.kernelLength + tap;
      accumulator = std.fma(value, packedDepthwiseWeightAt(logicalWeight), accumulator);
    }
  }

  packedF16DepthwiseConvLayout.$.dst[index] = maskPaddedChannels(
    activationSlot.$(accumulator),
    output.z,
    params.logicalChannels,
  );
};

export const packedF16DepthwiseHorizontalAxisKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_KERNEL_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  if (gid.x >= packedF16DepthwiseConvLayout.$.params.elementCount) {
    return;
  }
  packedF16AxisConvolution(gid.x, true);
});

export const packedF16DepthwiseVerticalAxisKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_KERNEL_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  if (gid.x >= packedF16DepthwiseConvLayout.$.params.elementCount) {
    return;
  }
  packedF16AxisConvolution(gid.x, false);
});
