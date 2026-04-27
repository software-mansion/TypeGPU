/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import { mockMnistWeights } from './utils/commonMocks.ts';

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
      enable f16;

      @group(0) @binding(0) var<storage, read> input: array<f32>;

      @group(1) @binding(0) var<storage, read> weights: array<f32>;

      @group(1) @binding(1) var<storage, read> biases: array<f32>;

      @group(0) @binding(1) var<storage, read_write> output: array<f32>;

      fn relu(x: f32) -> f32 {
        return max(0f, x);
      }

      @compute @workgroup_size(64) fn defaultCompute(@builtin(global_invocation_id) gid: vec3u) {
        let i = gid.x;
        let inputSize = arrayLength(&input);
        if ((i >= inputSize)) {
          return;
        }
        let weightsOffset = (i * inputSize);
        var sum = 0f;
        for (var j = 0u; (j < inputSize); j++) {
          sum = fma(input[j], weights[(weightsOffset + j)], sum);
        }
        let total = (sum + biases[i]);
        output[i] = relu(total);
      }

      enable subgroups;
      enable f16;

      @group(0) @binding(1) var<storage, read_write> output: array<f32>;

      @group(0) @binding(0) var<storage, read> input: array<f32>;

      @group(1) @binding(0) var<storage, read> weights: array<f32>;

      @group(1) @binding(1) var<storage, read> biases: array<f32>;

      fn relu(x: f32) -> f32 {
        return max(0f, x);
      }

      @compute @workgroup_size(64) fn subgroupCompute(@builtin(workgroup_id) wid: vec3u, @builtin(subgroup_invocation_id) sid: u32, @builtin(subgroup_id) sgid: u32, @builtin(num_subgroups) nsg: u32) {
        let outLen = arrayLength(&output);
        let inputSize = arrayLength(&input);
        let neuronIndex = ((wid.x * nsg) + sgid);
        let valid = (neuronIndex < outLen);
        let laneCount = subgroupAdd(1);
        var partial = 0f;
        if (valid) {
          let weightsOffset = (neuronIndex * inputSize);
          for (var j = sid; (j < inputSize); j += u32(laneCount)) {
            partial = fma(input[j], weights[(weightsOffset + j)], partial);
          }
        }
        let sum = subgroupAdd(partial);
        if ((valid && subgroupElect())) {
          output[neuronIndex] = relu((sum + biases[neuronIndex]));
        }
      }"
    `);
  });
});
