import { d, std, tgpu } from 'typegpu';
import { maskPaddedChannels } from './helpers.ts';
import { crossMergeLayout } from './layouts.ts';
import { CROSS_SCAN_DIRECTION_COUNT, DEPTH_KERNEL_WORKGROUP_SIZE } from './types.ts';

/** Maps a sequence position to a row-major source pixel for one CrossScan direction. */
export const crossScanSourcePixel = (
  direction: number,
  position: number,
  width: number,
  height: number,
) => {
  'use gpu';
  const positionCount = width * height;
  let traversalPosition = position;
  if (direction >= 2) {
    traversalPosition = positionCount - 1 - traversalPosition;
  }
  if (direction === 1 || direction === 3) {
    const x = std.intdiv(traversalPosition, height);
    const y = traversalPosition % height;
    return y * width + x;
  }
  return traversalPosition;
};

/** Inverse map: row-major output pixel to its position within a direction. */
export const crossScanPositionForPixel = (
  direction: number,
  pixel: number,
  width: number,
  height: number,
) => {
  'use gpu';
  const positionCount = width * height;
  let position = pixel;
  if (direction === 1 || direction === 3) {
    const x = pixel % width;
    const y = std.intdiv(pixel, width);
    position = x * height + y;
  }
  if (direction >= 2) {
    position = positionCount - 1 - position;
  }
  return position;
};

export const directionalScalarIndex = (
  direction: number,
  channel: number,
  position: number,
  logicalChannels: number,
  positionCount: number,
) => {
  'use gpu';
  return (direction * logicalChannels + channel) * positionCount + position;
};

const mergedChannel = (pixel: number, channel: number) => {
  'use gpu';
  const params = crossMergeLayout.$.params;
  if (channel >= params.logicalChannels) {
    return d.f32(0);
  }
  let sum = d.f32(0);
  for (let direction = d.u32(0); direction < CROSS_SCAN_DIRECTION_COUNT; direction += 1) {
    const position = crossScanPositionForPixel(direction, pixel, params.width, params.height);
    sum +=
      crossMergeLayout.$.directionalSrc[
        directionalScalarIndex(
          direction,
          channel,
          position,
          params.logicalChannels,
          params.positionCount,
        )
      ];
  }
  return sum;
};

/** Restores spatial order for all directions and sums them into one HWC4 tensor. */
export const crossMergeKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_KERNEL_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const index = gid.x;
  const params = crossMergeLayout.$.params;
  if (index >= params.elementCount) {
    return;
  }

  const channelBlock = index % params.channelBlocks;
  const pixel = std.intdiv(index, params.channelBlocks);
  const baseChannel = channelBlock * 4;
  const merged = d.vec4f(
    mergedChannel(pixel, baseChannel),
    mergedChannel(pixel, baseChannel + 1),
    mergedChannel(pixel, baseChannel + 2),
    mergedChannel(pixel, baseChannel + 3),
  );
  crossMergeLayout.$.dst[index] = maskPaddedChannels(merged, channelBlock, params.logicalChannels);
});
