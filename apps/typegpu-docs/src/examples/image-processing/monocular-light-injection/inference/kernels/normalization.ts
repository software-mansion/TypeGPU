import { d, std, tgpu } from 'typegpu';
import { maskPaddedChannels } from './helpers.ts';
import { layerNormLayout } from './layouts.ts';
import {
  LAYER_NORM_WORKGROUP_SIZE,
  layerNormLanesFor,
  layerNormPixelsPerGroup,
  type LayerNormShape,
} from './types.ts';

export const createSpecializedLayerNormKernel = (shape: LayerNormShape) => {
  const { pixelCount, channelBlocks, logicalChannels } = shape;
  const lanes = layerNormLanesFor(channelBlocks);
  const pixelsPerGroup = layerNormPixelsPerGroup(channelBlocks);
  const blocksPerLane = channelBlocks / lanes;
  const maskChannels = logicalChannels !== channelBlocks * 4;
  const guardPixels = pixelCount % pixelsPerGroup !== 0;
  const strides: number[] = [];
  for (let stride = lanes >> 1; stride >= 1; stride >>= 1) {
    strides.push(stride);
  }
  const partials = tgpu.workgroupVar(d.arrayOf(d.f32, LAYER_NORM_WORKGROUP_SIZE));

  return tgpu.computeFn({
    in: { lid: d.builtin.localInvocationId, wgid: d.builtin.workgroupId },
    workgroupSize: [lanes, pixelsPerGroup],
  })(({ lid, wgid }) => {
    'use gpu';
    const pixel = wgid.x * pixelsPerGroup + lid.y;
    let readPixel = pixel;
    if (guardPixels) {
      readPixel = std.min(pixel, pixelCount - 1);
    }
    const pixelBase = readPixel * channelBlocks;
    const slot = lid.y * lanes + lid.x;
    const groupBase = lid.y * lanes;

    let sum = d.f32(0);
    for (const step of tgpu.unroll(std.range(blocksPerLane))) {
      const value = d.vec4f(layerNormLayout.$.src[pixelBase + step * lanes + lid.x]);
      sum += value.x + value.y + value.z + value.w;
    }
    partials.$[slot] = sum;
    std.workgroupBarrier();
    for (const stride of tgpu.unroll(strides)) {
      if (lid.x < stride) {
        partials.$[slot] = partials.$[slot] + partials.$[slot + stride];
      }
      std.workgroupBarrier();
    }
    const mean = partials.$[groupBase] / logicalChannels;
    std.workgroupBarrier();

    let squaredDifferenceSum = d.f32(0);
    for (const step of tgpu.unroll(std.range(blocksPerLane))) {
      const block = step * lanes + lid.x;
      let difference = layerNormLayout.$.src[pixelBase + block] - mean;
      if (maskChannels) {
        difference = maskPaddedChannels(difference, block, logicalChannels);
      }
      squaredDifferenceSum += std.dot(difference, difference);
    }
    partials.$[slot] = squaredDifferenceSum;
    std.workgroupBarrier();
    for (const stride of tgpu.unroll(strides)) {
      if (lid.x < stride) {
        partials.$[slot] = partials.$[slot] + partials.$[slot + stride];
      }
      std.workgroupBarrier();
    }
    const inverseStdDev = std.inverseSqrt(
      partials.$[groupBase] / logicalChannels + layerNormLayout.$.params.epsilon,
    );

    if (!guardPixels || pixel < pixelCount) {
      for (const step of tgpu.unroll(std.range(blocksPerLane))) {
        const block = step * lanes + lid.x;
        const normalized =
          (layerNormLayout.$.src[pixelBase + block] - mean) *
            inverseStdDev *
            layerNormLayout.$.gamma[layerNormLayout.$.params.gammaBase + block] +
          layerNormLayout.$.beta[layerNormLayout.$.params.betaBase + block];
        if (maskChannels) {
          layerNormLayout.$.dst[pixelBase + block] = maskPaddedChannels(
            normalized,
            block,
            logicalChannels,
          );
        } else {
          layerNormLayout.$.dst[pixelBase + block] = d.vec4f(normalized);
        }
      }
    }
  });
};
