/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockMnistWeights } from '../utils/commonMocks.ts';

describe('mnist inference example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'algorithms',
      name: 'mnist-inference',
      setupMocks: mockMnistWeights,
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "fn relu_0(x: f32) -> f32 {
        return max(0, x);
      }

      @group(1) @binding(0) var<storage, read> weights_1: array<f32>;

      @group(1) @binding(1) var<storage, read> biases_2: array<f32>;

      @group(0) @binding(0) var<storage, read> input_3: array<f32>;

      @group(0) @binding(1) var<storage, read_write> output_4: array<f32>;
        @compute @workgroup_size(1)
        fn main(@builtin(global_invocation_id) gid: vec3u) {
          let inputSize = arrayLength( &input_3 );

          let i = gid.x;

          let weightsOffset = i * inputSize;
          var sum = 0.0;

          for (var j = 0u; j < inputSize; j = j + 1) {
            sum = fma(input_3[j], weights_1[weightsOffset + j], sum);
          }

          let total = sum + biases_2[i];
          output_4[i] = relu_0(total);
        }
      "
    `);
  });
});
