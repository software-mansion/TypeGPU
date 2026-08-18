import { d, std, tgpu } from 'typegpu';
import {
  activationSlot,
  blockedElement,
  coordinateOutOfBounds,
  hwc4Index,
  inputCoordinate,
  maskPaddedChannels,
} from './helpers.ts';
import { depthwiseConvLayout } from './layouts.ts';
import { DEPTH_KERNEL_WORKGROUP_SIZE } from './types.ts';

export const depthwise3x3Kernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_KERNEL_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const index = gid.x;
  const params = depthwiseConvLayout.$.params;
  if (index >= params.elementCount) {
    return;
  }

  const output = blockedElement(index, params.outputWidth, params.channelBlocks);
  let accumulator = d.vec4f(depthwiseConvLayout.$.bias[params.biasBase + output.z]);
  for (const ky of tgpu.unroll([0, 1, 2])) {
    const inputY = inputCoordinate(output.y, ky, params.strideY, params.padY);
    if (!coordinateOutOfBounds(inputY, params.inputHeight)) {
      for (const kx of tgpu.unroll([0, 1, 2])) {
        const inputX = inputCoordinate(output.x, kx, params.strideX, params.padX);
        if (!coordinateOutOfBounds(inputX, params.inputWidth)) {
          const value =
            depthwiseConvLayout.$.src[
              hwc4Index(
                d.u32(inputY),
                d.u32(inputX),
                output.z,
                params.inputWidth,
                params.channelBlocks,
              )
            ];
          const weight =
            depthwiseConvLayout.$.weights[params.weightBase + output.z * 9 + ky * 3 + kx];
          accumulator = std.fma(value, weight, accumulator);
        }
      }
    }
  }

  depthwiseConvLayout.$.dst[index] = maskPaddedChannels(
    activationSlot.$(accumulator),
    output.z,
    params.logicalChannels,
  );
});

const axisConvolution = (index: number, horizontal: boolean) => {
  'use gpu';
  const params = depthwiseConvLayout.$.params;
  const output = blockedElement(index, params.outputWidth, params.channelBlocks);
  let accumulator = d.vec4f(depthwiseConvLayout.$.bias[params.biasBase + output.z]);

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
        depthwiseConvLayout.$.src[
          hwc4Index(d.u32(inputY), d.u32(inputX), output.z, params.inputWidth, params.channelBlocks)
        ];
      const weight =
        depthwiseConvLayout.$.weights[params.weightBase + output.z * params.kernelLength + tap];
      accumulator = std.fma(value, weight, accumulator);
    }
  }

  depthwiseConvLayout.$.dst[index] = maskPaddedChannels(
    activationSlot.$(accumulator),
    output.z,
    params.logicalChannels,
  );
};

export const depthwiseHorizontalAxisKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_KERNEL_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  if (gid.x >= depthwiseConvLayout.$.params.elementCount) {
    return;
  }
  axisConvolution(gid.x, true);
});

export const depthwiseVerticalAxisKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_KERNEL_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  if (gid.x >= depthwiseConvLayout.$.params.elementCount) {
    return;
  }
  axisConvolution(gid.x, false);
});
