import { d, std, tgpu } from 'typegpu';
import { activationSlot, maskPaddedChannels } from './helpers.ts';
import { spatialColumnCount, type SpatialShape, type SpatialTile } from './types.ts';

/** Storage access for one specialized 3x3 path */
export interface SpatialConvAccessors {
  readonly sourceAt: (index: number) => d.v4f;
  readonly weightAt: (index: number) => d.v4f;
  readonly biasAt: (block: number) => d.v4f;
  readonly store: (index: number, value: d.v4f) => void;
}

/** Shape-specialized 3x3 convolution with FP32 columns */
export const createSpecializedConv3x3Kernel = (
  shape: SpatialShape,
  tile: SpatialTile,
  accessors: SpatialConvAccessors,
) => {
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
  const { sourceAt, weightAt, biasAt, store } = accessors;

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
        biasValue = d.vec4f(biasAt(outputBlock));
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
          const columns = d.arrayOf(d.vec4f, columnCount)();
          if (columnsInterior) {
            for (const column of tgpu.unroll(std.range(columnCount))) {
              columns[column] = d.vec4f(
                sourceAt(rowBase + d.u32(firstInputX + column) * inputChannelBlocks + inputBlock),
              );
            }
          } else {
            for (const column of tgpu.unroll(std.range(columnCount))) {
              const inputX = firstInputX + column;
              let value = d.vec4f(0);
              if (inputX >= 0 && inputX < d.i32(inputWidth)) {
                value = d.vec4f(
                  sourceAt(rowBase + d.u32(inputX) * inputChannelBlocks + inputBlock),
                );
              }
              columns[column] = d.vec4f(value);
            }
          }

          for (const blockLane of tgpu.unroll(std.range(blocksPerThread))) {
            const outputBlock = firstBlock + blockLane * blockThreads;
            for (const tapX of tgpu.unroll(std.range(3))) {
              const weightBase =
                (((outputBlock * inputChannelBlocks + inputBlock) * 3 + tapY) * 3 + tapX) * 4;
              const weight0 = d.vec4f(weightAt(weightBase));
              const weight1 = d.vec4f(weightAt(weightBase + 1));
              const weight2 = d.vec4f(weightAt(weightBase + 2));
              const weight3 = d.vec4f(weightAt(weightBase + 3));
              for (const columnLane of tgpu.unroll(std.range(columnsPerThread))) {
                const slot = blockLane * columnsPerThread + columnLane;
                const value = d.vec4f(columns[columnLane * strideX + tapX]);
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
              store(target, maskPaddedChannels(activated, outputBlock, logicalOutputChannels));
            } else {
              store(target, activated);
            }
          }
        }
      }
    }
  });
};
