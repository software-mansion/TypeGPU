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
  const tileSize = d.u32(TILE_SIZE);
  const numTiles =
    (computeLayout.$.dimensions.firstColumnCount + tileSize - 1) /
    tileSize;
  const row = input.wid.x * tileSize + input.lid.x;
  const col = input.wid.y * tileSize + input.lid.y;

  let result = 0;

  for (let t = d.u32(0); t < numTiles; t++) {
    const aCol = t * tileSize + input.lid.y;
    if (
      row < computeLayout.$.dimensions.firstRowCount &&
      aCol < computeLayout.$.dimensions.firstColumnCount
    ) {
      tileA.value[getTileIndex(input.lid.x, input.lid.y)] = computeLayout.$
        .firstMatrix[
          getIndex(
            row,
            aCol,
            computeLayout.$.dimensions.firstColumnCount,
          )
        ];
    } else {
      tileA.value[getTileIndex(input.lid.x, input.lid.y)] = 0;
    }

    const bRow = t * tileSize + input.lid.x;
    if (
      bRow < computeLayout.$.dimensions.firstColumnCount &&
      col < computeLayout.$.dimensions.secondColumnCount
    ) {
      tileB.value[getTileIndex(input.lid.x, input.lid.y)] = computeLayout.$
        .secondMatrix[
          getIndex(
            bRow,
            col,
            computeLayout.$.dimensions.secondColumnCount,
          )
        ];
    } else {
      tileB.value[getTileIndex(input.lid.x, input.lid.y)] = 0;
    }

    std.workgroupBarrier();

    const kLimit = std.min(
      tileSize,
      computeLayout.$.dimensions.firstColumnCount - t * tileSize,
    );
    for (let k = d.u32(0); k < kLimit; k++) {
      result += tileA.value[getTileIndex(input.lid.x, k)] *
        tileB.value[getTileIndex(k, input.lid.y)];
    }

    std.workgroupBarrier();
  }

  if (
    row < computeLayout.$.dimensions.firstRowCount &&
    col < computeLayout.$.dimensions.secondColumnCount
  ) {
    computeLayout.$
      .resultMatrix[
        getIndex(row, col, computeLayout.$.dimensions.secondColumnCount)
      ] = result;
  }
});
