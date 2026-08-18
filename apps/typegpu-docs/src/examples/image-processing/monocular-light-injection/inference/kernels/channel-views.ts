import { d, std, tgpu } from 'typegpu';
import { channelConcatLayout, channelSplitLayout } from './layouts.ts';
import { DEPTH_KERNEL_WORKGROUP_SIZE } from './types.ts';

/**
 * Materializes two channel-contiguous HWC4 tensors from one source tensor.
 * Every invocation copies exactly one vec4; block-aligned splits need no lane shuffle.
 */
export const channelSplitKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_KERNEL_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const index = gid.x;
  const params = channelSplitLayout.$.params;
  if (index >= params.elementCount) {
    return;
  }

  const sourceBlock = index % params.totalChannelBlocks;
  const pixel = std.intdiv(index, params.totalChannelBlocks);
  if (sourceBlock < params.lowChannelBlocks) {
    const destinationIndex = pixel * params.lowChannelBlocks + sourceBlock;
    channelSplitLayout.$.lowDst[destinationIndex] = d.vec4f(channelSplitLayout.$.src[index]);
  } else {
    const destinationIndex =
      pixel * params.highChannelBlocks + sourceBlock - params.lowChannelBlocks;
    channelSplitLayout.$.highDst[destinationIndex] = d.vec4f(channelSplitLayout.$.src[index]);
  }
});

/**
 * Materializes one HWC4 tensor from two channel-contiguous inputs. Every
 * invocation copies one vec4 into its corresponding output block.
 */
export const channelConcatKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_KERNEL_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const index = gid.x;
  const params = channelConcatLayout.$.params;
  if (index >= params.elementCount) {
    return;
  }

  const destinationBlock = index % params.totalChannelBlocks;
  const pixel = std.intdiv(index, params.totalChannelBlocks);
  if (destinationBlock < params.lowChannelBlocks) {
    const sourceIndex = pixel * params.lowChannelBlocks + destinationBlock;
    channelConcatLayout.$.dst[index] = d.vec4f(channelConcatLayout.$.lowSrc[sourceIndex]);
  } else {
    const sourceIndex =
      pixel * params.highChannelBlocks + destinationBlock - params.lowChannelBlocks;
    channelConcatLayout.$.dst[index] = d.vec4f(channelConcatLayout.$.highSrc[sourceIndex]);
  }
});
