import { d, std, tgpu } from 'typegpu';
import { blockedElement, hwc4Index, maskPaddedChannels } from './helpers.ts';
import { resizeLayout } from './layouts.ts';
import { DEPTH_KERNEL_WORKGROUP_SIZE } from './types.ts';

const halfPixelCoordinate = (output: number, inputSize: number, outputSize: number) => {
  'use gpu';
  return ((d.f32(output) + 0.5) * d.f32(inputSize)) / d.f32(outputSize) - 0.5;
};

const alignCornersCoordinate = (output: number, inputSize: number, outputSize: number) => {
  'use gpu';
  if (outputSize <= 1) {
    return d.f32(0);
  }
  return (d.f32(output) * d.f32(inputSize - 1)) / d.f32(outputSize - 1);
};

const sampleBilinear = (sourceX: number, sourceY: number, channelBlock: number) => {
  'use gpu';
  const params = resizeLayout.$.params;
  const base = d.vec2f(std.floor(sourceX), std.floor(sourceY));
  const fraction = d.vec2f(sourceX, sourceY) - base;
  const maximum = d.vec2f(params.inputWidth - 1, params.inputHeight - 1);
  const p0 = d.vec2u(std.clamp(base, d.vec2f(0), maximum));
  const p1 = d.vec2u(std.clamp(base + 1, d.vec2f(0), maximum));

  const top = std.mix(
    resizeLayout.$.src[
      hwc4Index(p0.y, p0.x, channelBlock, params.inputWidth, params.channelBlocks)
    ],
    resizeLayout.$.src[
      hwc4Index(p0.y, p1.x, channelBlock, params.inputWidth, params.channelBlocks)
    ],
    fraction.x,
  );
  const bottom = std.mix(
    resizeLayout.$.src[
      hwc4Index(p1.y, p0.x, channelBlock, params.inputWidth, params.channelBlocks)
    ],
    resizeLayout.$.src[
      hwc4Index(p1.y, p1.x, channelBlock, params.inputWidth, params.channelBlocks)
    ],
    fraction.x,
  );
  return std.mix(top, bottom, fraction.y);
};

/** ONNX `coordinate_transformation_mode=asymmetric`, `nearest_mode=floor`. */
export const nearestAsymmetricResizeKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_KERNEL_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const index = gid.x;
  const params = resizeLayout.$.params;
  if (index >= params.elementCount) {
    return;
  }

  const output = blockedElement(index, params.outputWidth, params.channelBlocks);
  const inputX = std.min(
    d.u32((d.f32(output.x) * d.f32(params.inputWidth)) / d.f32(params.outputWidth)),
    params.inputWidth - 1,
  );
  const inputY = std.min(
    d.u32((d.f32(output.y) * d.f32(params.inputHeight)) / d.f32(params.outputHeight)),
    params.inputHeight - 1,
  );
  const value =
    resizeLayout.$.src[
      hwc4Index(inputY, inputX, output.z, params.inputWidth, params.channelBlocks)
    ];
  resizeLayout.$.dst[index] = maskPaddedChannels(value, output.z, params.logicalChannels);
});

/** Bilinear resize with half-pixel coordinates (`align_corners=false`). */
export const bilinearHalfPixelResizeKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_KERNEL_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const index = gid.x;
  const params = resizeLayout.$.params;
  if (index >= params.elementCount) {
    return;
  }

  const output = blockedElement(index, params.outputWidth, params.channelBlocks);
  const value = sampleBilinear(
    halfPixelCoordinate(output.x, params.inputWidth, params.outputWidth),
    halfPixelCoordinate(output.y, params.inputHeight, params.outputHeight),
    output.z,
  );
  resizeLayout.$.dst[index] = maskPaddedChannels(value, output.z, params.logicalChannels);
});

/** Bilinear resize with endpoint-aligned coordinates (`align_corners=true`). */
export const bilinearAlignCornersResizeKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_KERNEL_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const index = gid.x;
  const params = resizeLayout.$.params;
  if (index >= params.elementCount) {
    return;
  }

  const output = blockedElement(index, params.outputWidth, params.channelBlocks);
  const value = sampleBilinear(
    alignCornersCoordinate(output.x, params.inputWidth, params.outputWidth),
    alignCornersCoordinate(output.y, params.inputHeight, params.outputHeight),
    output.z,
  );
  resizeLayout.$.dst[index] = maskPaddedChannels(value, output.z, params.logicalChannels);
});
