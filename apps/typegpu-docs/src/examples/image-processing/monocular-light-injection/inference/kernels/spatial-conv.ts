import { d, tgpu } from 'typegpu';
import {
  activationSlot,
  blockedElement,
  coordinateOutOfBounds,
  dotProductsO4I4,
  hwc4Index,
  inputCoordinate,
  maskPaddedChannels,
} from './helpers.ts';
import { conv2dLayout } from './layouts.ts';
import { dotO4I4Tile } from './pointwise.ts';
import { createSpecializedConv3x3Kernel } from './spatial-specialized.ts';
import { DEPTH_WIDE_WORKGROUP_SIZE, type SpatialShape, type SpatialTile } from './types.ts';

/** FP32 3x3 reference convolution, including stride 2 */
const referenceConv3x3At = (index: number) => {
  'use gpu';
  const params = conv2dLayout.$.params;
  if (index >= params.elementCount) {
    return;
  }

  const output = blockedElement(index, params.outputWidth, params.outputChannelBlocks);
  let accumulator = d.vec4f(conv2dLayout.$.bias[params.biasBase + output.z]);

  for (const ky of tgpu.unroll([0, 1, 2])) {
    const inputY = inputCoordinate(output.y, ky, params.strideY, params.padY);
    if (!coordinateOutOfBounds(inputY, params.inputHeight)) {
      for (const kx of tgpu.unroll([0, 1, 2])) {
        const inputX = inputCoordinate(output.x, kx, params.strideX, params.padX);
        if (!coordinateOutOfBounds(inputX, params.inputWidth)) {
          for (let inputBlock = d.u32(0); inputBlock < params.inputChannelBlocks; inputBlock += 1) {
            const value =
              conv2dLayout.$.src[
                hwc4Index(
                  d.u32(inputY),
                  d.u32(inputX),
                  inputBlock,
                  params.inputWidth,
                  params.inputChannelBlocks,
                )
              ];
            const tileBase =
              params.weightBase +
              (((output.z * params.inputChannelBlocks + inputBlock) * 3 + ky) * 3 + kx) * 4;
            accumulator += dotO4I4Tile(value, tileBase);
          }
        }
      }
    }
  }

  conv2dLayout.$.dst[index] = maskPaddedChannels(
    activationSlot.$(accumulator),
    output.z,
    params.logicalOutputChannels,
  );
};

export const conv3x3Kernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_WIDE_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  referenceConv3x3At(gid.x);
});

/** Shape-specialized FP32 3x3, reading plain O4/I4 weights from the shared arena */
export const createConv3x3SpecializedKernel = (shape: SpatialShape, tile: SpatialTile) =>
  createSpecializedConv3x3Kernel(shape, tile, {
    columnSchema: d.vec4f,
    sourceAt: (index: number) => {
      'use gpu';
      return d.vec4f(conv2dLayout.$.src[index]);
    },
    weightAt: (index: number) => {
      'use gpu';
      return d.vec4f(conv2dLayout.$.weights[conv2dLayout.$.params.weightBase + index]);
    },
    biasAt: (block: number) => {
      'use gpu';
      return d.vec4f(conv2dLayout.$.bias[conv2dLayout.$.params.biasBase + block]);
    },
    products: dotProductsO4I4,
    store: (index: number, value: d.v4f) => {
      'use gpu';
      conv2dLayout.$.dst[index] = d.vec4f(value);
    },
  });
