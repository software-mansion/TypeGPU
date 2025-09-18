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
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct MatrixInfo_2 {
        firstRowCount: u32,
        firstColumnCount: u32,
        secondColumnCount: u32,
      }

      @group(0) @binding(3) var<uniform> dimensions_1: MatrixInfo_2;

      fn getTileIndex_3(row: u32, col: u32) -> u32 {
        return (col + (row * 16));
      }

      fn getIndex_4(row: u32, col: u32, columns: u32) -> u32 {
        return (col + (row * columns));
      }

      @group(0) @binding(0) var<storage, read> firstMatrix_5: array<i32>;

      var<workgroup> tileA_6: array<i32, 256>;

      @group(0) @binding(1) var<storage, read> secondMatrix_7: array<i32>;

      var<workgroup> tileB_8: array<i32, 256>;

      @group(0) @binding(2) var<storage, read_write> resultMatrix_9: array<i32>;

      struct computeSharedMemory_Input_10 {
        @builtin(global_invocation_id) gid: vec3u,
        @builtin(local_invocation_id) lid: vec3u,
        @builtin(workgroup_id) wid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn computeSharedMemory_0(input: computeSharedMemory_Input_10) {
        var dimensions = dimensions_1;
        var numTiles = u32((f32(((dimensions.firstColumnCount + 16) - 1)) / 16f));
        var globalRow = ((input.wid.x * 16) + input.lid.x);
        var globalCol = ((input.wid.y * 16) + input.lid.y);
        var localRow = input.lid.x;
        var localCol = input.lid.y;
        var tileIdx = getTileIndex_3(localRow, localCol);
        var accumulatedResult = 0;
        for (var tileIndex = 0u; (tileIndex < numTiles); tileIndex++) {
          var matrixACol = ((tileIndex * 16) + localCol);
          var valueA = 0;
          if (((globalRow < dimensions.firstRowCount) && (matrixACol < dimensions.firstColumnCount))) {
            var indexA = getIndex_4(globalRow, matrixACol, dimensions.firstColumnCount);
            valueA = firstMatrix_5[indexA];
          }
          tileA_6[tileIdx] = valueA;
          var matrixBRow = ((tileIndex * 16) + localRow);
          var valueB = 0;
          if (((matrixBRow < dimensions.firstColumnCount) && (globalCol < dimensions.secondColumnCount))) {
            var indexB = getIndex_4(matrixBRow, globalCol, dimensions.secondColumnCount);
            valueB = secondMatrix_7[indexB];
          }
          tileB_8[tileIdx] = valueB;
          workgroupBarrier();
          var effectiveTileSize = min(16, (dimensions.firstColumnCount - (tileIndex * 16)));
          for (var k = 0u; (k < effectiveTileSize); k++) {
            var tileA_element = tileA_6[getTileIndex_3(localRow, k)];
            var tileB_element = tileB_8[getTileIndex_3(k, localCol)];
            accumulatedResult += (tileA_element * tileB_element);
          }
          workgroupBarrier();
        }
        if (((globalRow < dimensions.firstRowCount) && (globalCol < dimensions.secondColumnCount))) {
          var outputIndex = getIndex_4(globalRow, globalCol, dimensions.secondColumnCount);
          resultMatrix_9[outputIndex] = accumulatedResult;
        }
      }"
    `);
  });
});
