import { d, std, tgpu } from 'typegpu';
import { createDepthwiseKernels } from './depthwise.ts';
import {
  activationSlot,
  blockedElement,
  coordinateOutOfBounds,
  halfDotProductsO4I4,
  hwc4Index,
  inputCoordinate,
  maskPaddedChannels,
} from './helpers.ts';
import { nativeF16Conv2dLayout, nativeF16DepthwiseConvLayout } from './layouts.ts';
import { createSpecializedConv3x3Kernel } from './spatial-specialized.ts';
import {
  DEPTH_WIDE_WORKGROUP_SIZE,
  POINTWISE_DEFAULT_TILE,
  POINTWISE_FLUSH_BLOCKS,
  type PointwiseShape,
  type PointwiseTile,
  type SpatialShape,
  type SpatialTile,
} from './types.ts';

/** Compile-time IO specialization; native kernels still keep FP32 bias/accumulation */
export const nativeF16SourceIsF16Slot = tgpu.slot(false);
export const nativeF16DestinationIsF16Slot = tgpu.slot(false);

const loadRawF32 = (index: number) => {
  'use gpu';
  const pairBase = index * 2;
  const low = d.vec2u(nativeF16Conv2dLayout.$.src[pairBase]);
  const high = d.vec2u(nativeF16Conv2dLayout.$.src[pairBase + 1]);
  return std.bitcast(d.vec4u, d.vec4f)(d.vec4u(low.x, low.y, high.x, high.y));
};

const loadRawF16 = (index: number) => {
  'use gpu';
  return std.bitcast(d.vec2u, d.vec4h)(d.vec2u(nativeF16Conv2dLayout.$.src[index]));
};

const nativeConvSourceAt = (index: number) => {
  'use gpu';
  if (nativeF16SourceIsF16Slot.$) {
    return d.vec4h(loadRawF16(index));
  }
  return d.vec4h(loadRawF32(index));
};

/** `weightBase` counts 16-byte logical vec4s, so it doubles into vec4h rows */
const nativeConvWeightAt = (logicalVec4Index: number) => {
  'use gpu';
  const params = nativeF16Conv2dLayout.$.params;
  return d.vec4h(nativeF16Conv2dLayout.$.weights[params.weightBase * 2 + logicalVec4Index]);
};

const storeNativeConvOutput = (index: number, value: d.v4f) => {
  'use gpu';
  if (nativeF16DestinationIsF16Slot.$) {
    nativeF16Conv2dLayout.$.dst[index] = std.bitcast(d.vec4h, d.vec2u)(d.vec4h(value));
  } else {
    const words = std.bitcast(d.vec4f, d.vec4u)(value);
    const pairBase = index * 2;
    nativeF16Conv2dLayout.$.dst[pairBase] = d.vec2u(words.x, words.y);
    nativeF16Conv2dLayout.$.dst[pairBase + 1] = d.vec2u(words.z, words.w);
  }
};

const nativeDotO4I4Tile = (value: d.v4h, tileBase: number) => {
  'use gpu';
  return halfDotProductsO4I4(
    value,
    nativeConvWeightAt(tileBase),
    nativeConvWeightAt(tileBase + 1),
    nativeConvWeightAt(tileBase + 2),
    nativeConvWeightAt(tileBase + 3),
  );
};

/** Native half-precision products with FP32 bias and cross-block accumulation */
export const nativeF16Conv1x1Kernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_WIDE_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const index = gid.x;
  const params = nativeF16Conv2dLayout.$.params;
  if (index >= params.elementCount) {
    return;
  }

  const output = blockedElement(index, params.outputWidth, params.outputChannelBlocks);
  const inputX = output.x * params.strideX;
  const inputY = output.y * params.strideY;
  let accumulator = d.vec4f(nativeF16Conv2dLayout.$.bias[params.biasBase + output.z]);
  for (let inputBlock = d.u32(0); inputBlock < params.inputChannelBlocks; inputBlock += 1) {
    const value = nativeConvSourceAt(
      hwc4Index(inputY, inputX, inputBlock, params.inputWidth, params.inputChannelBlocks),
    );
    const tileBase = (output.z * params.inputChannelBlocks + inputBlock) * 4;
    accumulator += nativeDotO4I4Tile(value, tileBase);
  }

  storeNativeConvOutput(
    index,
    maskPaddedChannels(activationSlot.$(accumulator), output.z, params.logicalOutputChannels),
  );
});

export const createNativeF16SpecializedConv1x1Kernel = (
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
  const guardChunk = inputChannelBlocks % POINTWISE_FLUSH_BLOCKS !== 0;

  return tgpu.computeFn({
    in: { lid: d.builtin.localInvocationId, wgid: d.builtin.workgroupId },
    workgroupSize: [blockThreads, pixelThreads],
  })(({ lid, wgid }) => {
    'use gpu';
    const firstBlock = wgid.x * blocksPerGroup + lid.x;
    const firstPixel = wgid.y * pixelsPerGroup + lid.y;
    const accumulators = d.arrayOf(d.vec4f, blocksPerThread * pixelsPerThread)();
    const chunkAccumulators = d.arrayOf(d.vec4h, blocksPerThread * pixelsPerThread)();

    for (const blockLane of tgpu.unroll(std.range(blocksPerThread))) {
      const outputBlock = firstBlock + blockLane * blockThreads;
      let biasValue = d.vec4f(0);
      if (!guardBlocks || outputBlock < outputChannelBlocks) {
        biasValue = d.vec4f(
          nativeF16Conv2dLayout.$.bias[nativeF16Conv2dLayout.$.params.biasBase + outputBlock],
        );
      }
      for (const pixelLane of tgpu.unroll(std.range(pixelsPerThread))) {
        accumulators[blockLane * pixelsPerThread + pixelLane] = d.vec4f(biasValue);
      }
    }

    for (
      let chunkBase = d.u32(0);
      chunkBase < inputChannelBlocks;
      chunkBase += POINTWISE_FLUSH_BLOCKS
    ) {
      for (const blockLane of tgpu.unroll(std.range(blocksPerThread))) {
        for (const pixelLane of tgpu.unroll(std.range(pixelsPerThread))) {
          chunkAccumulators[blockLane * pixelsPerThread + pixelLane] = d.vec4h(0);
        }
      }

      for (let step = d.u32(0); step < POINTWISE_FLUSH_BLOCKS; step += 1) {
        const inputBlock = chunkBase + step;
        if (!guardChunk || inputBlock < inputChannelBlocks) {
          const inputs = d.arrayOf(d.vec4h, pixelsPerThread)();
          for (const pixelLane of tgpu.unroll(std.range(pixelsPerThread))) {
            const pixel = firstPixel + pixelLane * pixelThreads;
            inputs[pixelLane] = d.vec4h(
              nativeConvSourceAt(pixel * inputChannelBlocks + inputBlock),
            );
          }

          for (const blockLane of tgpu.unroll(std.range(blocksPerThread))) {
            const outputBlock = firstBlock + blockLane * blockThreads;
            const tileBase = (outputBlock * inputChannelBlocks + inputBlock) * 4;
            const weight0 = d.vec4h(nativeConvWeightAt(tileBase));
            const weight1 = d.vec4h(nativeConvWeightAt(tileBase + 1));
            const weight2 = d.vec4h(nativeConvWeightAt(tileBase + 2));
            const weight3 = d.vec4h(nativeConvWeightAt(tileBase + 3));
            for (const pixelLane of tgpu.unroll(std.range(pixelsPerThread))) {
              const slot = blockLane * pixelsPerThread + pixelLane;
              const value = d.vec4h(inputs[pixelLane]);
              chunkAccumulators[slot] =
                chunkAccumulators[slot] +
                weight0 * value.x +
                weight1 * value.y +
                weight2 * value.z +
                weight3 * value.w;
            }
          }
        }
      }

      for (const blockLane of tgpu.unroll(std.range(blocksPerThread))) {
        for (const pixelLane of tgpu.unroll(std.range(pixelsPerThread))) {
          const slot = blockLane * pixelsPerThread + pixelLane;
          accumulators[slot] = accumulators[slot] + d.vec4f(chunkAccumulators[slot]);
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
              storeNativeConvOutput(
                pixel * outputChannelBlocks + outputBlock,
                maskPaddedChannels(activated, outputBlock, logicalOutputChannels),
              );
            } else {
              storeNativeConvOutput(pixel * outputChannelBlocks + outputBlock, activated);
            }
          }
        }
      }
    }
  });
};

/** Native-FP16 3x3 products with FP32 cross-block accumulation */
export const nativeF16Conv3x3Kernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_WIDE_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const index = gid.x;
  const params = nativeF16Conv2dLayout.$.params;
  if (index >= params.elementCount) {
    return;
  }

  const output = blockedElement(index, params.outputWidth, params.outputChannelBlocks);
  let accumulator = d.vec4f(nativeF16Conv2dLayout.$.bias[params.biasBase + output.z]);
  for (const ky of tgpu.unroll([0, 1, 2])) {
    const inputY = inputCoordinate(output.y, ky, params.strideY, params.padY);
    if (!coordinateOutOfBounds(inputY, params.inputHeight)) {
      for (const kx of tgpu.unroll([0, 1, 2])) {
        const inputX = inputCoordinate(output.x, kx, params.strideX, params.padX);
        if (!coordinateOutOfBounds(inputX, params.inputWidth)) {
          for (let inputBlock = d.u32(0); inputBlock < params.inputChannelBlocks; inputBlock += 1) {
            const value = nativeConvSourceAt(
              hwc4Index(
                d.u32(inputY),
                d.u32(inputX),
                inputBlock,
                params.inputWidth,
                params.inputChannelBlocks,
              ),
            );
            const tileBase =
              (((output.z * params.inputChannelBlocks + inputBlock) * 3 + ky) * 3 + kx) * 4;
            accumulator += nativeDotO4I4Tile(value, tileBase);
          }
        }
      }
    }
  }

  storeNativeConvOutput(
    index,
    maskPaddedChannels(activationSlot.$(accumulator), output.z, params.logicalOutputChannels),
  );
});

/** Shape-specialized native-FP16 3x3, staging vec4h columns */
export const createNativeF16Conv3x3SpecializedKernel = (shape: SpatialShape, tile: SpatialTile) =>
  createSpecializedConv3x3Kernel(shape, tile, {
    columnSchema: d.vec4h,
    sourceAt: nativeConvSourceAt,
    weightAt: nativeConvWeightAt,
    biasAt: (block: number) => {
      'use gpu';
      return d.vec4f(nativeF16Conv2dLayout.$.bias[nativeF16Conv2dLayout.$.params.biasBase + block]);
    },
    products: halfDotProductsO4I4,
    store: storeNativeConvOutput,
  });

const loadDepthwiseSourceF32 = (index: number) => {
  'use gpu';
  const wordBase = index * 4;
  return std.bitcast(
    d.vec4u,
    d.vec4f,
  )(
    d.vec4u(
      nativeF16DepthwiseConvLayout.$.src[wordBase],
      nativeF16DepthwiseConvLayout.$.src[wordBase + 1],
      nativeF16DepthwiseConvLayout.$.src[wordBase + 2],
      nativeF16DepthwiseConvLayout.$.src[wordBase + 3],
    ),
  );
};

const loadDepthwiseSourceF16 = (index: number) => {
  'use gpu';
  const wordBase = index * 2;
  return std.bitcast(
    d.vec2u,
    d.vec4h,
  )(
    d.vec2u(
      nativeF16DepthwiseConvLayout.$.src[wordBase],
      nativeF16DepthwiseConvLayout.$.src[wordBase + 1],
    ),
  );
};

const nativeDepthwiseSourceAt = (index: number) => {
  'use gpu';
  if (nativeF16SourceIsF16Slot.$) {
    return d.vec4h(loadDepthwiseSourceF16(index));
  }
  return d.vec4h(loadDepthwiseSourceF32(index));
};

const nativeDepthwiseWeightAt = (logicalVec4Index: number) => {
  'use gpu';
  const params = nativeF16DepthwiseConvLayout.$.params;
  const wordBase = params.weightBase * 4 + logicalVec4Index * 2;
  return std.bitcast(
    d.vec2u,
    d.vec4h,
  )(
    d.vec2u(
      nativeF16DepthwiseConvLayout.$.weights[wordBase],
      nativeF16DepthwiseConvLayout.$.weights[wordBase + 1],
    ),
  );
};

const storeNativeDepthwiseOutput = (index: number, value: d.v4f) => {
  'use gpu';
  if (nativeF16DestinationIsF16Slot.$) {
    const words = std.bitcast(d.vec4h, d.vec2u)(d.vec4h(value));
    const wordBase = index * 2;
    nativeF16DepthwiseConvLayout.$.dst[wordBase] = words.x;
    nativeF16DepthwiseConvLayout.$.dst[wordBase + 1] = words.y;
  } else {
    const words = std.bitcast(d.vec4f, d.vec4u)(value);
    const wordBase = index * 4;
    nativeF16DepthwiseConvLayout.$.dst[wordBase] = words.x;
    nativeF16DepthwiseConvLayout.$.dst[wordBase + 1] = words.y;
    nativeF16DepthwiseConvLayout.$.dst[wordBase + 2] = words.z;
    nativeF16DepthwiseConvLayout.$.dst[wordBase + 3] = words.w;
  }
};

/** Native-FP16 depthwise family with FP32 accumulation and compile-time FP16/FP32 IO */
const nativeDepthwiseKernels = createDepthwiseKernels<d.v4h>({
  layout: nativeF16DepthwiseConvLayout,
  sourceAt: nativeDepthwiseSourceAt,
  weightAt: nativeDepthwiseWeightAt,
  biasAt: (block: number) => {
    'use gpu';
    return d.vec4f(
      nativeF16DepthwiseConvLayout.$.bias[nativeF16DepthwiseConvLayout.$.params.biasBase + block],
    );
  },
  accumulate: (accumulator: d.v4f, source: d.v4h, weight: d.v4h) => {
    'use gpu';
    return accumulator + d.vec4f(source * weight);
  },
  store: storeNativeDepthwiseOutput,
});

export const nativeF16Depthwise3x3Kernel = nativeDepthwiseKernels.kernel3x3;
export const nativeF16DepthwiseHorizontalAxisKernel = nativeDepthwiseKernels.horizontalAxisKernel;
export const nativeF16DepthwiseVerticalAxisKernel = nativeDepthwiseKernels.verticalAxisKernel;
