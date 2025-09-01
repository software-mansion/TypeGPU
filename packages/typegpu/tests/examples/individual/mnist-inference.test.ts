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
      controlTriggers: ['Test Resolution'],
      expectedCalls: 2,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "enable subgroups;

      struct defaultCompute_Input_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(0) var<storage, read> input_2: array<f32>;

      @group(1) @binding(0) var<storage, read> weights_3: array<f32>;

      @group(1) @binding(1) var<storage, read> biases_4: array<f32>;

      @group(0) @binding(1) var<storage, read_write> output_5: array<f32>;

      fn relu_6(x: f32) -> f32 {
        return max(0, x);
      }

      @compute @workgroup_size(1) fn defaultCompute_0(_arg_0: defaultCompute_Input_1) {
        var inputSize = arrayLength(&input_2);
        var i = _arg_0.gid.x;
        var weightsOffset = (i * inputSize);
        var sum = 0f;
        for (var j = 0u; (j < inputSize); j++) {
          sum = fma(input_2[j], weights_3[(weightsOffset + j)], sum);
        }
        var total = (sum + biases_4[i]);
        output_5[i] = relu_6(total);
      }

      enable subgroups;

      struct subgroupCompute_Input_1 {
        @builtin(local_invocation_id) lid: vec3u,
        @builtin(workgroup_id) wid: vec3u,
        @builtin(subgroup_invocation_id) sid: u32,
        @builtin(subgroup_size) ssize: u32,
      }

      const workgroupSize_2: u32 = 128;

      @group(0) @binding(1) var<storage, read_write> output_3: array<f32>;

      @group(0) @binding(0) var<storage, read> input_4: array<f32>;

      @group(1) @binding(0) var<storage, read> weights_5: array<f32>;

      @group(1) @binding(1) var<storage, read> biases_6: array<f32>;

      fn relu_7(x: f32) -> f32 {
        return max(0, x);
      }

      @compute @workgroup_size(128) fn subgroupCompute_0(_arg_0: subgroupCompute_Input_1) {
        var subgroupId = u32((f32(_arg_0.lid.x) / f32(_arg_0.ssize)));
        var outputsPerWG = u32((f32(workgroupSize_2) / f32(_arg_0.ssize)));
        var neuronIndex = ((_arg_0.wid.x * outputsPerWG) + subgroupId);
        var outLen = arrayLength(&output_3);
        var valid = (neuronIndex < outLen);
        var inputSize = arrayLength(&input_4);
        var partial = 0f;
        if (valid) {
          var weightsOffset = (neuronIndex * inputSize);
          for (var j = _arg_0.sid; (j < inputSize); j += _arg_0.ssize) {
            partial = fma(input_4[j], weights_5[(weightsOffset + j)], partial);
          }
        }
        var sum = subgroupAdd(partial);
        if ((valid && (_arg_0.sid == 0))) {
          output_3[neuronIndex] = relu_7((sum + biases_6[neuronIndex]));
        }
      }"
    `);
  });
});
