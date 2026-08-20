import { d, std, tgpu } from 'typegpu';
import { activationSlot, maskPaddedChannels } from './helpers.ts';
import { spatialColumnCount, type SpatialShape, type SpatialTile } from './types.ts';

/** Storage access of one specialized 3x3 variant; `nativeF16` fixes the staging precision */
export interface SpatialConvAccessors {
  readonly nativeF16: boolean;
  sourceAt(index: number): d.v4f | d.v4h;
  weightAt(index: number): d.v4f | d.v4h;
  biasAt(block: number): d.v4f;
  products(
    value: d.v4f | d.v4h,
    weight0: d.v4f | d.v4h,
    weight1: d.v4f | d.v4h,
    weight2: d.v4f | d.v4h,
    weight3: d.v4f | d.v4h,
  ): d.v4f;
  store(index: number, value: d.v4f): void;
}

/** Shape-specialized 3x3 convolution with FP32 accumulation over staged columns */
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
  const { nativeF16, sourceAt, weightAt, biasAt, products, store } = accessors;
  const columnSchema = nativeF16 ? d.vec4h : d.vec4f;

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
          const columns = d.arrayOf(columnSchema, columnCount)();
          if (columnsInterior) {
            for (const column of tgpu.unroll(std.range(columnCount))) {
              columns[column] = sourceAt(
                rowBase + d.u32(firstInputX + column) * inputChannelBlocks + inputBlock,
              );
            }
          } else {
            for (const column of tgpu.unroll(std.range(columnCount))) {
              const inputX = firstInputX + column;
              columns[column] = nativeF16 ? d.vec4h(0) : d.vec4f(0);
              if (inputX >= 0 && inputX < d.i32(inputWidth)) {
                columns[column] = sourceAt(
                  rowBase + d.u32(inputX) * inputChannelBlocks + inputBlock,
                );
              }
            }
          }

          for (const blockLane of tgpu.unroll(std.range(blocksPerThread))) {
            const outputBlock = firstBlock + blockLane * blockThreads;
            for (const tapX of tgpu.unroll(std.range(3))) {
              const weightBase =
                (((outputBlock * inputChannelBlocks + inputBlock) * 3 + tapY) * 3 + tapX) * 4;
              const weight0 = weightAt(weightBase);
              const weight1 = weightAt(weightBase + 1);
              const weight2 = weightAt(weightBase + 2);
              const weight3 = weightAt(weightBase + 3);
              for (const columnLane of tgpu.unroll(std.range(columnsPerThread))) {
                const slot = blockLane * columnsPerThread + columnLane;
                accumulators[slot] =
                  accumulators[slot] +
                  products(
                    columns[columnLane * strideX + tapX],
                    weight0,
                    weight1,
                    weight2,
                    weight3,
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
