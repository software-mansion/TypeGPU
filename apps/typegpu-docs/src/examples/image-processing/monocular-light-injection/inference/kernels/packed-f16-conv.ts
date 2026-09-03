import { d, std } from 'typegpu';
import { createDepthwiseKernels, fmaAccumulate } from './depthwise.ts';
import { packedF16DepthwiseConvLayout } from './layouts.ts';

/** Packed-FP16 depthwise weights decoded to FP32 before multiplication */
const packedKernels = createDepthwiseKernels<d.v4f>({
  layout: packedF16DepthwiseConvLayout,
  sourceAt: (index: number) => {
    'use gpu';
    return d.vec4f(packedF16DepthwiseConvLayout.$.src[index]);
  },
  weightAt: (logicalVec4Index: number) => {
    'use gpu';
    const wordBase = packedF16DepthwiseConvLayout.$.params.weightBase * 4 + logicalVec4Index * 2;
    const xy = std.unpack2x16float(packedF16DepthwiseConvLayout.$.weights[wordBase]);
    const zw = std.unpack2x16float(packedF16DepthwiseConvLayout.$.weights[wordBase + 1]);
    return d.vec4f(xy, zw);
  },
  biasAt: (block: number) => {
    'use gpu';
    return d.vec4f(
      packedF16DepthwiseConvLayout.$.bias[packedF16DepthwiseConvLayout.$.params.biasBase + block],
    );
  },
  accumulate: fmaAccumulate,
  store: (index: number, value: d.v4f) => {
    'use gpu';
    packedF16DepthwiseConvLayout.$.dst[index] = d.vec4f(value);
  },
});

export const packedF16Depthwise3x3Kernel = packedKernels.kernel3x3;
export const packedF16DepthwiseHorizontalAxisKernel = packedKernels.horizontalAxisKernel;
export const packedF16DepthwiseVerticalAxisKernel = packedKernels.verticalAxisKernel;
