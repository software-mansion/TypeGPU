import { d, std, tgpu } from 'typegpu';
import {
  activationSlot,
  blockedElement,
  coordinateOutOfBounds,
  hwc4Index,
  inputCoordinate,
  maskPaddedChannels,
} from './helpers.ts';
import {
  depthwiseConvLayout,
  nativeF16DepthwiseConvLayout,
  packedF16DepthwiseConvLayout,
} from './layouts.ts';
import { DEPTH_KERNEL_WORKGROUP_SIZE } from './types.ts';

type DepthwiseParamsLayout =
  | typeof depthwiseConvLayout
  | typeof packedF16DepthwiseConvLayout
  | typeof nativeF16DepthwiseConvLayout;

/** Storage access of one depthwise variant; precision differences live in `accumulate` */
interface DepthwiseVariant<TVec extends d.v4f | d.v4h> {
  readonly layout: DepthwiseParamsLayout;
  readonly sourceAt: (index: number) => TVec;
  readonly weightAt: (logicalVec4Index: number) => TVec;
  readonly biasAt: (block: number) => d.v4f;
  readonly accumulate: (accumulator: d.v4f, source: TVec, weight: TVec) => d.v4f;
  readonly store: (index: number, value: d.v4f) => void;
}

/** The {3x3, 1x7, 7x1} depthwise kernel family over one storage variant */
export const createDepthwiseKernels = <TVec extends d.v4f | d.v4h>(
  variant: DepthwiseVariant<TVec>,
) => {
  const { layout, sourceAt, weightAt, biasAt, accumulate, store } = variant;

  const convolve3x3 = (index: number) => {
    'use gpu';
    const params = layout.$.params;
    const output = blockedElement(index, params.outputWidth, params.channelBlocks);
    let accumulator = biasAt(output.z);
    for (const ky of tgpu.unroll([0, 1, 2])) {
      const inputY = inputCoordinate(output.y, ky, params.strideY, params.padY);
      if (!coordinateOutOfBounds(inputY, params.inputHeight)) {
        for (const kx of tgpu.unroll([0, 1, 2])) {
          const inputX = inputCoordinate(output.x, kx, params.strideX, params.padX);
          if (!coordinateOutOfBounds(inputX, params.inputWidth)) {
            const source = sourceAt(
              hwc4Index(
                d.u32(inputY),
                d.u32(inputX),
                output.z,
                params.inputWidth,
                params.channelBlocks,
              ),
            );
            accumulator = accumulate(accumulator, source, weightAt(output.z * 9 + ky * 3 + kx));
          }
        }
      }
    }
    store(
      index,
      maskPaddedChannels(activationSlot.$(accumulator), output.z, params.logicalChannels),
    );
  };

  const axisConvolve = (index: number, horizontal: boolean) => {
    'use gpu';
    const params = layout.$.params;
    const output = blockedElement(index, params.outputWidth, params.channelBlocks);
    let accumulator = biasAt(output.z);
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
        const source = sourceAt(
          hwc4Index(
            d.u32(inputY),
            d.u32(inputX),
            output.z,
            params.inputWidth,
            params.channelBlocks,
          ),
        );
        accumulator = accumulate(
          accumulator,
          source,
          weightAt(output.z * params.kernelLength + tap),
        );
      }
    }
    store(
      index,
      maskPaddedChannels(activationSlot.$(accumulator), output.z, params.logicalChannels),
    );
  };

  const guarded = (convolve: (index: number) => void) =>
    tgpu.computeFn({
      in: { gid: d.builtin.globalInvocationId },
      workgroupSize: [DEPTH_KERNEL_WORKGROUP_SIZE],
    })(({ gid }) => {
      'use gpu';
      if (gid.x < layout.$.params.elementCount) {
        convolve(gid.x);
      }
    });

  return {
    kernel3x3: guarded(convolve3x3),
    horizontalAxisKernel: guarded((index: number) => {
      'use gpu';
      axisConvolve(index, true);
    }),
    verticalAxisKernel: guarded((index: number) => {
      'use gpu';
      axisConvolve(index, false);
    }),
  };
};

export const fmaAccumulate = (accumulator: d.v4f, source: d.v4f, weight: d.v4f) => {
  'use gpu';
  return std.fma(source, weight, accumulator);
};

const f32Kernels = createDepthwiseKernels<d.v4f>({
  layout: depthwiseConvLayout,
  sourceAt: (index: number) => {
    'use gpu';
    return d.vec4f(depthwiseConvLayout.$.src[index]);
  },
  weightAt: (logicalVec4Index: number) => {
    'use gpu';
    return d.vec4f(
      depthwiseConvLayout.$.weights[depthwiseConvLayout.$.params.weightBase + logicalVec4Index],
    );
  },
  biasAt: (block: number) => {
    'use gpu';
    return d.vec4f(depthwiseConvLayout.$.bias[depthwiseConvLayout.$.params.biasBase + block]);
  },
  accumulate: fmaAccumulate,
  store: (index: number, value: d.v4f) => {
    'use gpu';
    depthwiseConvLayout.$.dst[index] = d.vec4f(value);
  },
});

export const depthwise3x3Kernel = f32Kernels.kernel3x3;
export const depthwiseHorizontalAxisKernel = f32Kernels.horizontalAxisKernel;
export const depthwiseVerticalAxisKernel = f32Kernels.verticalAxisKernel;
