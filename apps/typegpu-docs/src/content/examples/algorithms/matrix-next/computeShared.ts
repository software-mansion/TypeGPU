import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { TILE_SIZE, WORKGROUP_SIZE } from './params.ts';
import { computeLayout } from './types.ts';

const tileA = tgpu['~unstable'].workgroupVar(d.arrayOf(d.i32, TILE_SIZE ** 2));
const tileB = tgpu['~unstable'].workgroupVar(d.arrayOf(d.i32, TILE_SIZE ** 2));

export const getIndex = tgpu['~unstable'].fn([d.u32, d.u32, d.u32], d.u32)(
  (row, col, columns) => {
    return col + row * columns;
  },
);

const getTileIndex = tgpu['~unstable'].fn([d.u32, d.u32], d.u32)((row, col) => {
  return col + row * TILE_SIZE;
});

export const computeSharedMemory = tgpu['~unstable'].computeFn({
  workgroupSize: WORKGROUP_SIZE,
  in: {
    gid: d.builtin.globalInvocationId,
    lid: d.builtin.localInvocationId,
    wid: d.builtin.workgroupId,
  },
})((input) => {
  const dimensions = computeLayout.$.dimensions;
  const numTiles = (dimensions.firstColumnCount + TILE_SIZE - 1) / TILE_SIZE;

  const globalRow = input.wid.x * TILE_SIZE + input.lid.x;
  const globalCol = input.wid.y * TILE_SIZE + input.lid.y;
  const localRow = input.lid.x;
  const localCol = input.lid.y;
  const tileIdx = getTileIndex(localRow, localCol);

  let accumulatedResult = 0;

  for (let tileIndex = d.u32(0); tileIndex < numTiles; tileIndex++) {
    const matrixACol = tileIndex * TILE_SIZE + localCol;
    let valueA = 0;

    if (
      globalRow < dimensions.firstRowCount &&
      matrixACol < dimensions.firstColumnCount
    ) {
      const indexA = getIndex(
        globalRow,
        matrixACol,
        dimensions.firstColumnCount,
      );
      valueA = computeLayout.$.firstMatrix[indexA];
    }
    tileA.value[tileIdx] = valueA;

    const matrixBRow = tileIndex * TILE_SIZE + localRow;
    let valueB = 0;

    if (
      matrixBRow < dimensions.firstColumnCount &&
      globalCol < dimensions.secondColumnCount
    ) {
      const indexB = getIndex(
        matrixBRow,
        globalCol,
        dimensions.secondColumnCount,
      );
      valueB = computeLayout.$.secondMatrix[indexB];
    }
    tileB.value[tileIdx] = valueB;

    std.workgroupBarrier();

    const effectiveTileSize = std.min(
      TILE_SIZE,
      dimensions.firstColumnCount - tileIndex * TILE_SIZE,
    );

    for (let k = d.u32(0); k < effectiveTileSize; k++) {
      const tileA_element = tileA.value[getTileIndex(localRow, k)];
      const tileB_element = tileB.value[getTileIndex(k, localCol)];
      accumulatedResult += tileA_element * tileB_element;
    }

    std.workgroupBarrier();
  }

  if (
    globalRow < dimensions.firstRowCount &&
    globalCol < dimensions.secondColumnCount
  ) {
    const outputIndex = getIndex(
      globalRow,
      globalCol,
      dimensions.secondColumnCount,
    );
    computeLayout.$.resultMatrix[outputIndex] = accumulatedResult;
  }
});
