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
      "
        @binding(0) @group(0) var<storage, read> input: array<f32>;
        @binding(1) @group(0) var<storage, read_write> output: array<f32>;

        @binding(0) @group(1) var<storage, read> weights: array<f32>;
        @binding(1) @group(1) var<storage, read> biases: array<f32>;

        fn relu(x: f32) -> f32 {
          return max(0.0, x);
        }

        @compute @workgroup_size(1)
        fn main(@builtin(global_invocation_id) gid: vec3u) {
          let inputSize = arrayLength( &input );

          let i = gid.x;

          let weightsOffset = i * inputSize;
          var sum = 0.0;

          for (var j = 0u; j < inputSize; j = j + 1) {
            sum = sum + input[j] * weights[weightsOffset + j];
          }

          sum = sum + biases[i];
          output[i] = relu(sum);
        }
      "
    `);
  });
});
