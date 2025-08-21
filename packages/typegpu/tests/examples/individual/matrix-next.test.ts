/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('matrix(next) example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'algorithms',
      name: 'matrix-next',
      controlTriggers: ['Compute'],
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct computeSharedMemory_Input_1 {
        @builtin(global_invocation_id) gid: vec3u,
        @builtin(local_invocation_id) lid: vec3u,
        @builtin(workgroup_id) wid: vec3u,
      }

      struct MatrixInfo_3 {
        firstRowCount: u32,
        firstColumnCount: u32,
        secondColumnCount: u32,
      }

      @group(0) @binding(3) var<uniform> dimensions_2: MatrixInfo_3;

      fn getTileIndex_4(row: u32, col: u32) -> u32 {
        return (col + (row * 16));
      }

      fn getIndex_5(row: u32, col: u32, columns: u32) -> u32 {
        return (col + (row * columns));
      }

      @group(0) @binding(0) var<storage, read> firstMatrix_6: array<i32>;

      var<workgroup> tileA_7: array<i32, 256>;

      @group(0) @binding(1) var<storage, read> secondMatrix_8: array<i32>;

      var<workgroup> tileB_9: array<i32, 256>;

      @group(0) @binding(2) var<storage, read_write> resultMatrix_10: array<i32>;

      @compute @workgroup_size(16, 16) fn computeSharedMemory_0(input: computeSharedMemory_Input_1) {
        var dimensions = dimensions_2;
        var numTiles = u32((f32(((dimensions.firstColumnCount + 16) - 1)) / 16f));
        var globalRow = ((input.wid.x * 16) + input.lid.x);
        var globalCol = ((input.wid.y * 16) + input.lid.y);
        var localRow = input.lid.x;
        var localCol = input.lid.y;
        var tileIdx = getTileIndex_4(localRow, localCol);
        var accumulatedResult = 0;
        for (var tileIndex = u32(0); (tileIndex < numTiles); tileIndex++) {
          var matrixACol = ((tileIndex * 16) + localCol);
          var valueA = 0;
          if (((globalRow < dimensions.firstRowCount) && (matrixACol < dimensions.firstColumnCount))) {
            var indexA = getIndex_5(globalRow, matrixACol, dimensions.firstColumnCount);
            valueA = firstMatrix_6[indexA];
          }
          tileA_7[tileIdx] = valueA;
          var matrixBRow = ((tileIndex * 16) + localRow);
          var valueB = 0;
          if (((matrixBRow < dimensions.firstColumnCount) && (globalCol < dimensions.secondColumnCount))) {
            var indexB = getIndex_5(matrixBRow, globalCol, dimensions.secondColumnCount);
            valueB = secondMatrix_8[indexB];
          }
          tileB_9[tileIdx] = valueB;
          workgroupBarrier();
          var effectiveTileSize = min(16, (dimensions.firstColumnCount - (tileIndex * 16)));
          for (var k = u32(0); (k < effectiveTileSize); k++) {
            var tileA_element = tileA_7[getTileIndex_4(localRow, k)];
            var tileB_element = tileB_9[getTileIndex_4(k, localCol)];
            accumulatedResult += (tileA_element * tileB_element);
          }
          workgroupBarrier();
        }
        if (((globalRow < dimensions.firstRowCount) && (globalCol < dimensions.secondColumnCount))) {
          var outputIndex = getIndex_5(globalRow, globalCol, dimensions.secondColumnCount);
          resultMatrix_10[outputIndex] = accumulatedResult;
        }
      }"
    `);
  });
});
