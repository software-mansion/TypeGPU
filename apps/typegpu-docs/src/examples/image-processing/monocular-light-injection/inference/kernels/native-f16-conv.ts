import { d, std, tgpu } from 'typegpu';
import {
  activationSlot,
  blockedElement,
  coordinateOutOfBounds,
  hwc4Index,
  inputCoordinate,
  maskPaddedChannels,
} from './helpers.ts';
import { nativeF16Conv2dLayout, nativeF16DepthwiseConvLayout } from './layouts.ts';
import {
  DEPTH_KERNEL_WORKGROUP_SIZE,
  DEPTH_WIDE_WORKGROUP_SIZE,
  POINTWISE_DEFAULT_TILE,
  POINTWISE_FLUSH_BLOCKS,
  type PointwiseTile,
  spatialColumnCount,
  type PointwiseShape,
  type SpatialShape,
  type SpatialTile,
} from './types.ts';

/** Compile-time IO specialization; native kernels still keep FP32 bias/accumulation. */
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

/** `weightBase` counts 16-byte logical vec4s, so it doubles into vec4h rows. */
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
  return d.vec4f(
    d.f32(std.dot(value, nativeConvWeightAt(tileBase))),
    d.f32(std.dot(value, nativeConvWeightAt(tileBase + 1))),
    d.f32(std.dot(value, nativeConvWeightAt(tileBase + 2))),
    d.f32(std.dot(value, nativeConvWeightAt(tileBase + 3))),
  );
};

/** Native half-precision products with FP32 bias and cross-block accumulation. */
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

/**
 * Shape-specialized native-FP16 1x1 convolution. Channel-block counts, pixel
 * count, and output masking are compile-time literals, so the whole address
 * computation folds to `pixel * inputChannelBlocks + block`. Each thread owns
 * `blocksPerThread * pixelsPerThread` accumulators,
 * which amortizes every load across the register tile and removes the staged
 * tiles and their barriers.
 *
 * Products accumulate by outer product against I4/O4 weights: each of the four
 * input lanes scales a whole `vec4h` of output lanes, so sixteen multiply-adds
 * cost four FMAs instead of four dot products, four widening converts and four
 * FP32 adds. `outerProductPointwiseWeights` transposes the lane pair of exactly
 * the weight tensors that reach this kernel, and the dispatch builder fails if
 * that set ever stops matching.
 *
 * A `vec4h` accumulator carries each chunk of `POINTWISE_FLUSH_BLOCKS` input
 * blocks before flushing into the FP32 accumulator, so long channel runs still
 * accumulate in FP32 across chunks.
 */
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

/** Native-FP16 3x3 products with FP32 cross-block accumulation. */
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

const nativeF16Depthwise3x3At = (index: number) => {
  'use gpu';
  const params = nativeF16DepthwiseConvLayout.$.params;
  const output = blockedElement(index, params.outputWidth, params.channelBlocks);
  let accumulator = d.vec4f(nativeF16DepthwiseConvLayout.$.bias[params.biasBase + output.z]);
  for (const ky of tgpu.unroll([0, 1, 2])) {
    const inputY = inputCoordinate(output.y, ky, params.strideY, params.padY);
    if (!coordinateOutOfBounds(inputY, params.inputHeight)) {
      for (const kx of tgpu.unroll([0, 1, 2])) {
        const inputX = inputCoordinate(output.x, kx, params.strideX, params.padX);
        if (!coordinateOutOfBounds(inputX, params.inputWidth)) {
          const sourceIndex = hwc4Index(
            d.u32(inputY),
            d.u32(inputX),
            output.z,
            params.inputWidth,
            params.channelBlocks,
          );
          accumulator += d.vec4f(
            nativeDepthwiseSourceAt(sourceIndex) *
              nativeDepthwiseWeightAt(output.z * 9 + ky * 3 + kx),
          );
        }
      }
    }
  }
  storeNativeDepthwiseOutput(
    index,
    maskPaddedChannels(activationSlot.$(accumulator), output.z, params.logicalChannels),
  );
};

export const nativeF16Depthwise3x3Kernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_KERNEL_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  if (gid.x < nativeF16DepthwiseConvLayout.$.params.elementCount) {
    nativeF16Depthwise3x3At(gid.x);
  }
});

const nativeF16AxisConvolution = (index: number, horizontal: boolean) => {
  'use gpu';
  const params = nativeF16DepthwiseConvLayout.$.params;
  const output = blockedElement(index, params.outputWidth, params.channelBlocks);
  let accumulator = d.vec4f(nativeF16DepthwiseConvLayout.$.bias[params.biasBase + output.z]);
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
      const sourceIndex = hwc4Index(
        d.u32(inputY),
        d.u32(inputX),
        output.z,
        params.inputWidth,
        params.channelBlocks,
      );
      accumulator += d.vec4f(
        nativeDepthwiseSourceAt(sourceIndex) *
          nativeDepthwiseWeightAt(output.z * params.kernelLength + tap),
      );
    }
  }
  storeNativeDepthwiseOutput(
    index,
    maskPaddedChannels(activationSlot.$(accumulator), output.z, params.logicalChannels),
  );
};

export const nativeF16DepthwiseHorizontalAxisKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_KERNEL_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  if (gid.x < nativeF16DepthwiseConvLayout.$.params.elementCount) {
    nativeF16AxisConvolution(gid.x, true);
  }
});

export const nativeF16DepthwiseVerticalAxisKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_KERNEL_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  if (gid.x < nativeF16DepthwiseConvLayout.$.params.elementCount) {
    nativeF16AxisConvolution(gid.x, false);
  }
});

/**
 * Shape-specialized native-FP16 3x3. Mirrors the FP32 specialization, with the
 * staged column window held as `vec4h` and products accumulated in FP32.
 */
export const createNativeF16Conv3x3SpecializedKernel = (shape: SpatialShape, tile: SpatialTile) => {
  const {
    inputChannelBlocks,
    outputChannelBlocks,
    inputWidth,
    inputHeight,
    outputWidth,
    strideX,
    strideY,
    padX,
    padY,
    logicalOutputChannels,
  } = shape;
  const { blockThreads, blocksPerThread, columnThreads, columnsPerThread } = tile;
  const blocksPerGroup = blockThreads * blocksPerThread;
  const columnsPerGroup = columnThreads * columnsPerThread;
  const columnCount = spatialColumnCount(tile, strideX);
  const guardColumns = outputWidth % columnsPerGroup !== 0;
  const guardBlocks = outputChannelBlocks % blocksPerGroup !== 0;
  const maskChannels = logicalOutputChannels !== outputChannelBlocks * 4;

  return tgpu.computeFn({
    in: { lid: d.builtin.localInvocationId, wgid: d.builtin.workgroupId },
    workgroupSize: [blockThreads, columnThreads],
  })(({ lid, wgid }) => {
    'use gpu';
    const firstBlock = wgid.x * blocksPerGroup + lid.x;
    const firstColumn = wgid.y * columnsPerGroup + lid.y * columnsPerThread;
    const outputRow = wgid.z;
    const firstInputX = d.i32(firstColumn) * strideX - padX;
    const columnsInterior = firstInputX >= 0 && firstInputX + (columnCount - 1) < d.i32(inputWidth);

    const accumulators = d.arrayOf(d.vec4f, blocksPerThread * columnsPerThread)();
    for (const blockLane of tgpu.unroll(std.range(blocksPerThread))) {
      const outputBlock = firstBlock + blockLane * blockThreads;
      let biasValue = d.vec4f(0);
      if (!guardBlocks || outputBlock < outputChannelBlocks) {
        biasValue = d.vec4f(
          nativeF16Conv2dLayout.$.bias[nativeF16Conv2dLayout.$.params.biasBase + outputBlock],
        );
      }
      for (const columnLane of tgpu.unroll(std.range(columnsPerThread))) {
        accumulators[blockLane * columnsPerThread + columnLane] = d.vec4f(biasValue);
      }
    }

    for (const tapY of tgpu.unroll(std.range(3))) {
      const inputY = d.i32(outputRow) * strideY + tapY - padY;
      if (inputY >= 0 && inputY < d.i32(inputHeight)) {
        const rowBase = d.u32(inputY) * inputWidth * inputChannelBlocks;
        for (let inputBlock = d.u32(0); inputBlock < inputChannelBlocks; inputBlock += 1) {
          const columns = d.arrayOf(d.vec4h, columnCount)();
          if (columnsInterior) {
            for (const column of tgpu.unroll(std.range(columnCount))) {
              columns[column] = d.vec4h(
                nativeConvSourceAt(
                  rowBase + d.u32(firstInputX + column) * inputChannelBlocks + inputBlock,
                ),
              );
            }
          } else {
            for (const column of tgpu.unroll(std.range(columnCount))) {
              const inputX = firstInputX + column;
              let value = d.vec4h(0);
              if (inputX >= 0 && inputX < d.i32(inputWidth)) {
                value = d.vec4h(
                  nativeConvSourceAt(rowBase + d.u32(inputX) * inputChannelBlocks + inputBlock),
                );
              }
              columns[column] = d.vec4h(value);
            }
          }

          for (const blockLane of tgpu.unroll(std.range(blocksPerThread))) {
            const outputBlock = firstBlock + blockLane * blockThreads;
            for (const tapX of tgpu.unroll(std.range(3))) {
              const weightBase =
                (((outputBlock * inputChannelBlocks + inputBlock) * 3 + tapY) * 3 + tapX) * 4;
              const weight0 = d.vec4h(nativeConvWeightAt(weightBase));
              const weight1 = d.vec4h(nativeConvWeightAt(weightBase + 1));
              const weight2 = d.vec4h(nativeConvWeightAt(weightBase + 2));
              const weight3 = d.vec4h(nativeConvWeightAt(weightBase + 3));
              for (const columnLane of tgpu.unroll(std.range(columnsPerThread))) {
                const slot = blockLane * columnsPerThread + columnLane;
                const value = d.vec4h(columns[columnLane * strideX + tapX]);
                accumulators[slot] =
                  accumulators[slot] +
                  d.vec4f(
                    d.f32(std.dot(value, weight0)),
                    d.f32(std.dot(value, weight1)),
                    d.f32(std.dot(value, weight2)),
                    d.f32(std.dot(value, weight3)),
                  );
              }
            }
          }
        }
      }
    }

    const rowOutputBase = outputRow * outputWidth;
    for (const blockLane of tgpu.unroll(std.range(blocksPerThread))) {
      const outputBlock = firstBlock + blockLane * blockThreads;
      if (!guardBlocks || outputBlock < outputChannelBlocks) {
        for (const columnLane of tgpu.unroll(std.range(columnsPerThread))) {
          const outputColumn = firstColumn + columnLane;
          if (!guardColumns || outputColumn < outputWidth) {
            const activated = activationSlot.$(
              accumulators[blockLane * columnsPerThread + columnLane],
            );
            const target = (rowOutputBase + outputColumn) * outputChannelBlocks + outputBlock;
            if (maskChannels) {
              storeNativeConvOutput(
                target,
                maskPaddedChannels(activated, outputBlock, logicalOutputChannels),
              );
            } else {
              storeNativeConvOutput(target, activated);
            }
          }
        }
      }
    }
  });
};
