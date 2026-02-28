/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('matrix(next) example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'algorithms',
        name: 'matrix-next',
        controlTriggers: ['Compute'],
        expectedCalls: 1,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct MatrixInfo {
        firstRowCount: u32,
        firstColumnCount: u32,
        secondColumnCount: u32,
      }

      @group(0) @binding(3) var<uniform> dimensions_1: MatrixInfo;

      fn getTileIndex(row: u32, col: u32) -> u32 {
        return (col + (row * 16u));
      }

      fn getIndex(row: u32, col: u32, columns: u32) -> u32 {
        return (col + (row * columns));
      }

      @group(0) @binding(0) var<storage, read> firstMatrix: array<i32>;

      var<workgroup> tileA: array<i32, 256>;

      @group(0) @binding(1) var<storage, read> secondMatrix: array<i32>;

      var<workgroup> tileB: array<i32, 256>;

      @group(0) @binding(2) var<storage, read_write> resultMatrix: array<i32>;

      struct computeSharedMemory_Input {
        @builtin(global_invocation_id) gid: vec3u,
        @builtin(local_invocation_id) lid: vec3u,
        @builtin(workgroup_id) wid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn computeSharedMemory(input: computeSharedMemory_Input) {
        let dimensions = (&dimensions_1);
        let numTiles = u32((f32((((*dimensions).firstColumnCount + 16u) - 1u)) / 16f));
        let globalRow = ((input.wid.x * 16u) + input.lid.x);
        let globalCol = ((input.wid.y * 16u) + input.lid.y);
        let localRow = input.lid.x;
        let localCol = input.lid.y;
        let tileIdx = getTileIndex(localRow, localCol);
        var accumulatedResult = 0;
        for (var tileIndex = 0u; (tileIndex < numTiles); tileIndex++) {
          let matrixACol = ((tileIndex * 16u) + localCol);
          var valueA = 0;
          if (((globalRow < (*dimensions).firstRowCount) && (matrixACol < (*dimensions).firstColumnCount))) {
            let indexA = getIndex(globalRow, matrixACol, (*dimensions).firstColumnCount);
            valueA = firstMatrix[indexA];
          }
          tileA[tileIdx] = valueA;
          let matrixBRow = ((tileIndex * 16u) + localRow);
          var valueB = 0;
          if (((matrixBRow < (*dimensions).firstColumnCount) && (globalCol < (*dimensions).secondColumnCount))) {
            let indexB = getIndex(matrixBRow, globalCol, (*dimensions).secondColumnCount);
            valueB = secondMatrix[indexB];
          }
          tileB[tileIdx] = valueB;
          workgroupBarrier();
          let effectiveTileSize = min(16u, ((*dimensions).firstColumnCount - (tileIndex * 16u)));
          for (var k = 0u; (k < effectiveTileSize); k++) {
            let tileA_element = tileA[getTileIndex(localRow, k)];
            let tileB_element = tileB[getTileIndex(k, localCol)];
            accumulatedResult += (tileA_element * tileB_element);
          }
          workgroupBarrier();
        }
        if (((globalRow < (*dimensions).firstRowCount) && (globalCol < (*dimensions).secondColumnCount))) {
          let outputIndex = getIndex(globalRow, globalCol, (*dimensions).secondColumnCount);
          resultMatrix[outputIndex] = accumulatedResult;
        }
      }"
    `);
  });
});
