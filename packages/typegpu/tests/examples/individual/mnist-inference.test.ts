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
    const shaderCodes = await runExampleTest(
      {
        category: 'algorithms',
        name: 'mnist-inference',
        setupMocks: mockMnistWeights,
        controlTriggers: ['Test Resolution'],
        expectedCalls: 2,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "enable subgroups;

      @group(0) @binding(0) var<storage, read> input: array<f32>;

      @group(1) @binding(0) var<storage, read> weights: array<f32>;

      @group(1) @binding(1) var<storage, read> biases: array<f32>;

      @group(0) @binding(1) var<storage, read_write> output: array<f32>;

      fn relu(x: f32) -> f32 {
        return max(0f, x);
      }

      struct defaultCompute_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn defaultCompute(_arg_0: defaultCompute_Input) {
        let inputSize = arrayLength(&input);
        let i = _arg_0.gid.x;
        let weightsOffset = (i * inputSize);
        var sum = 0f;
        for (var j = 0u; (j < inputSize); j++) {
          sum = fma(input[j], weights[(weightsOffset + j)], sum);
        }
        let total = (sum + biases[i]);
        output[i] = relu(total);
      }

      enable subgroups;

      const workgroupSize: u32 = 128u;

      @group(0) @binding(1) var<storage, read_write> output: array<f32>;

      @group(0) @binding(0) var<storage, read> input: array<f32>;

      @group(1) @binding(0) var<storage, read> weights: array<f32>;

      @group(1) @binding(1) var<storage, read> biases: array<f32>;

      fn relu(x: f32) -> f32 {
        return max(0f, x);
      }

      struct subgroupCompute_Input {
        @builtin(local_invocation_id) lid: vec3u,
        @builtin(workgroup_id) wid: vec3u,
        @builtin(subgroup_invocation_id) sid: u32,
        @builtin(subgroup_size) ssize: u32,
      }

      @compute @workgroup_size(128) fn subgroupCompute(_arg_0: subgroupCompute_Input) {
        let subgroupId = u32((f32(_arg_0.lid.x) / f32(_arg_0.ssize)));
        let outputsPerWG = u32((f32(workgroupSize) / f32(_arg_0.ssize)));
        let neuronIndex = ((_arg_0.wid.x * outputsPerWG) + subgroupId);
        let outLen = arrayLength(&output);
        let valid = (neuronIndex < outLen);
        let inputSize = arrayLength(&input);
        var partial = 0f;
        if (valid) {
          let weightsOffset = (neuronIndex * inputSize);
          for (var j = _arg_0.sid; (j < inputSize); j += _arg_0.ssize) {
            partial = fma(input[j], weights[(weightsOffset + j)], partial);
          }
        }
        let sum = subgroupAdd(partial);
        if ((valid && (_arg_0.sid == 0u))) {
          output[neuronIndex] = relu((sum + biases[neuronIndex]));
        }
      }"
    `);
  });
});
