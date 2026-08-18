import { d, std, tgpu } from 'typegpu';
import { activationSlot, blockedElement, hwc4Index, maskPaddedChannels } from './helpers.ts';
import { conv2dLayout } from './layouts.ts';
import {
  DEPTH_WIDE_WORKGROUP_SIZE,
  POINTWISE_DEFAULT_TILE,
  type PointwiseShape,
  type PointwiseTile,
} from './types.ts';

const dotO4I4Tile = (value: d.v4f, tileBase: number) => {
  'use gpu';
  return d.vec4f(
    std.dot(value, conv2dLayout.$.weights[tileBase]),
    std.dot(value, conv2dLayout.$.weights[tileBase + 1]),
    std.dot(value, conv2dLayout.$.weights[tileBase + 2]),
    std.dot(value, conv2dLayout.$.weights[tileBase + 3]),
  );
};

/** Correctness baseline: one invocation computes four output channels for one pixel. */
export const conv1x1Kernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_WIDE_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const index = gid.x;
  const params = conv2dLayout.$.params;
  if (index >= params.elementCount) {
    return;
  }

  const output = blockedElement(index, params.outputWidth, params.outputChannelBlocks);
  const inputX = output.x * params.strideX;
  const inputY = output.y * params.strideY;
  let accumulator = d.vec4f(conv2dLayout.$.bias[params.biasBase + output.z]);

  for (let inputBlock = d.u32(0); inputBlock < params.inputChannelBlocks; inputBlock += 1) {
    const value =
      conv2dLayout.$.src[
        hwc4Index(inputY, inputX, inputBlock, params.inputWidth, params.inputChannelBlocks)
      ];
    const tileBase = params.weightBase + (output.z * params.inputChannelBlocks + inputBlock) * 4;
    accumulator += dotO4I4Tile(value, tileBase);
  }

  conv2dLayout.$.dst[index] = maskPaddedChannels(
    activationSlot.$(accumulator),
    output.z,
    params.logicalOutputChannels,
  );
});

/**
 * Shape-specialized portable FP32 1x1 convolution. The FP32 counterpart of the
 * native-FP16 specialization: compile-time channel-block counts collapse
 * addressing to `pixel * inputChannelBlocks + block`, and each thread owns a
 * register tile of accumulators rather than one output block.
 */
export const createSpecializedConv1x1Kernel = (
  shape: PointwiseShape,
  tile: PointwiseTile = POINTWISE_DEFAULT_TILE,
) => {
  const { inputChannelBlocks, outputChannelBlocks, pixelCount, logicalOutputChannels } = shape;
  const { blockThreads, blocksPerThread, pixelThreads, pixelsPerThread } = tile;
  const blocksPerGroup = blockThreads * blocksPerThread;
  const pixelsPerGroup = pixelThreads * pixelsPerThread;
  const guardPixels = pixelCount % pixelsPerGroup !== 0;
  const guardBlocks = outputChannelBlocks % blocksPerGroup !== 0;
  const maskChannels = logicalOutputChannels !== outputChannelBlocks * 4;

  return tgpu.computeFn({
    in: { lid: d.builtin.localInvocationId, wgid: d.builtin.workgroupId },
    workgroupSize: [blockThreads, pixelThreads],
  })(({ lid, wgid }) => {
    'use gpu';
    const firstBlock = wgid.x * blocksPerGroup + lid.x;
    const firstPixel = wgid.y * pixelsPerGroup + lid.y;
    const accumulators = d.arrayOf(d.vec4f, blocksPerThread * pixelsPerThread)();

    for (const blockLane of tgpu.unroll(std.range(blocksPerThread))) {
      const outputBlock = firstBlock + blockLane * blockThreads;
      let biasValue = d.vec4f(0);
      if (!guardBlocks || outputBlock < outputChannelBlocks) {
        biasValue = d.vec4f(conv2dLayout.$.bias[conv2dLayout.$.params.biasBase + outputBlock]);
      }
      for (const pixelLane of tgpu.unroll(std.range(pixelsPerThread))) {
        accumulators[blockLane * pixelsPerThread + pixelLane] = d.vec4f(biasValue);
      }
    }

    for (let inputBlock = d.u32(0); inputBlock < inputChannelBlocks; inputBlock += 1) {
      const inputs = d.arrayOf(d.vec4f, pixelsPerThread)();
      for (const pixelLane of tgpu.unroll(std.range(pixelsPerThread))) {
        const pixel = firstPixel + pixelLane * pixelThreads;
        inputs[pixelLane] = d.vec4f(conv2dLayout.$.src[pixel * inputChannelBlocks + inputBlock]);
      }

      for (const blockLane of tgpu.unroll(std.range(blocksPerThread))) {
        const outputBlock = firstBlock + blockLane * blockThreads;
        const tileBase =
          conv2dLayout.$.params.weightBase + (outputBlock * inputChannelBlocks + inputBlock) * 4;
        const weight0 = d.vec4f(conv2dLayout.$.weights[tileBase]);
        const weight1 = d.vec4f(conv2dLayout.$.weights[tileBase + 1]);
        const weight2 = d.vec4f(conv2dLayout.$.weights[tileBase + 2]);
        const weight3 = d.vec4f(conv2dLayout.$.weights[tileBase + 3]);
        for (const pixelLane of tgpu.unroll(std.range(pixelsPerThread))) {
          const slot = blockLane * pixelsPerThread + pixelLane;
          const value = d.vec4f(inputs[pixelLane]);
          accumulators[slot] =
            accumulators[slot] +
            d.vec4f(
              std.dot(value, weight0),
              std.dot(value, weight1),
              std.dot(value, weight2),
              std.dot(value, weight3),
            );
        }
      }
    }

    for (const blockLane of tgpu.unroll(std.range(blocksPerThread))) {
      const outputBlock = firstBlock + blockLane * blockThreads;
      if (!guardBlocks || outputBlock < outputChannelBlocks) {
        for (const pixelLane of tgpu.unroll(std.range(pixelsPerThread))) {
          const pixel = firstPixel + pixelLane * pixelThreads;
          if (!guardPixels || pixel < pixelCount) {
            const activated = activationSlot.$(
              accumulators[blockLane * pixelsPerThread + pixelLane],
            );
            if (maskChannels) {
              conv2dLayout.$.dst[pixel * outputChannelBlocks + outputBlock] = maskPaddedChannels(
                activated,
                outputBlock,
                logicalOutputChannels,
              );
            } else {
              conv2dLayout.$.dst[pixel * outputChannelBlocks + outputBlock] = d.vec4f(activated);
            }
          }
        }
      }
    }
  });
};
