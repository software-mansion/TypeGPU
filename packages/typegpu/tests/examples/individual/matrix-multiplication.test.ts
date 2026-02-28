/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('matrix multiplication example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'algorithms',
        name: 'matrix-multiplication',
        expectedCalls: 1,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct MatrixStruct {
        size: vec2f,
        numbers: array<f32, 36>,
      }

      @group(0) @binding(0) var<storage, read> firstMatrix: MatrixStruct;
      @group(0) @binding(1) var<storage, read> secondMatrix: MatrixStruct;
      @group(0) @binding(2) var<storage, read_write> resultMatrix: MatrixStruct;

      @compute @workgroup_size(8, 8)
      fn main(@builtin(global_invocation_id) global_id: vec3u) {
        if (global_id.x >= u32(firstMatrix.size.x) || global_id.y >= u32(secondMatrix.size.y)) {
          return;
        }

        if (global_id.x + global_id.y == 0u) {
          resultMatrix.size = vec2(firstMatrix.size.x, secondMatrix.size.y);
        }

        let resultCell = vec2(global_id.x, global_id.y);
        var result = 0.0;

        for (var i = 0u; i < u32(firstMatrix.size.y); i = i + 1u) {
          let a = i + resultCell.x * u32(firstMatrix.size.y);
          let b = resultCell.y + i * u32(secondMatrix.size.y);
          result = result + firstMatrix.numbers[a] * secondMatrix.numbers[b];
        }

        let index = resultCell.y + resultCell.x * u32(secondMatrix.size.y);
        resultMatrix.numbers[index] = result;
      }"
    `);
  });
});
