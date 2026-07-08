/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import { mockMnistWeights } from './utils/commonMocks.ts';

describe('mnist inference example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ adapter, device }) => {
    for (const feature of ['subgroups', 'shader-f16'] satisfies GPUFeatureName[]) {
      adapter.features.add(feature);
      (device.features as Set<GPUFeatureName>).add(feature);
    }

    const shaderCodes = await runExampleTest(
      {
        category: 'algorithms',
        name: 'mnist-inference',
        setupMocks: mockMnistWeights,
        controlTriggers: ['Test Resolution'],
        expectedCalls: 4,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "enable f16;
      enable subgroups;

      @group(0) @binding(1) var<storage, read_write> output: array<f16>;

      @group(0) @binding(0) var<storage, read> input: array<f16>;

      @group(1) @binding(0) var<storage, read> weights: array<f16>;

      @group(1) @binding(1) var<storage, read> biases: array<f16>;

      fn relu(x: f16) -> f16 {
        return max(0h, x);
      }

      @compute @workgroup_size(64) fn defaultCompute(@builtin(global_invocation_id) gid: vec3u) {
        let i = gid.x;
        let outLen = arrayLength(&output);
        if ((i >= outLen)) {
          return;
        }
        let inputSize = arrayLength(&input);
        let weightsOffset = (i * inputSize);
        var sum = 0h;
        for (var j = 0u; (j < inputSize); j++) {
          sum = fma(input[j], weights[(weightsOffset + j)], sum);
        }
        let total = (sum + biases[i]);
        output[i] = relu(total);
      }

      enable f16;
      enable subgroups;

      @group(0) @binding(1) var<storage, read_write> output: array<f16>;

      @group(0) @binding(0) var<storage, read> input: array<f16>;

      @group(1) @binding(0) var<storage, read> weights: array<f16>;

      @group(1) @binding(1) var<storage, read> biases: array<f16>;

      fn relu(x: f16) -> f16 {
        return max(0h, x);
      }

      @compute @workgroup_size(64) fn subgroupCompute(@builtin(workgroup_id) wid: vec3u, @builtin(subgroup_invocation_id) sid: u32, @builtin(subgroup_id) sgid: u32, @builtin(subgroup_size) subgroupSize: u32) {
        let outLen = arrayLength(&output);
        let inputSize = arrayLength(&input);
        let neuronIndex = wid.x;
        let valid = ((sgid == 0u) && (neuronIndex < outLen));
        var partial = 0h;
        if (valid) {
          let weightsOffset = (neuronIndex * inputSize);
          for (var j = sid; (j < inputSize); j += subgroupSize) {
            partial = fma(input[j], weights[(weightsOffset + j)], partial);
          }
        }
        let sum = subgroupAdd(partial);
        if ((valid && subgroupElect())) {
          output[neuronIndex] = relu((sum + biases[neuronIndex]));
        }
      }

      enable subgroups;
      enable f16;

      @group(0) @binding(1) var<storage, read_write> output: array<f16>;

      @group(0) @binding(0) var<storage, read> input: array<f16>;

      @group(1) @binding(0) var<storage, read> weights: array<f16>;

      @group(1) @binding(1) var<storage, read> biases: array<f16>;

      fn relu(x: f16) -> f16 {
        return max(0h, x);
      }

      @compute @workgroup_size(64) fn defaultCompute(@builtin(global_invocation_id) gid: vec3u) {
        let i = gid.x;
        let outLen = arrayLength(&output);
        if ((i >= outLen)) {
          return;
        }
        let inputSize = arrayLength(&input);
        let weightsOffset = (i * inputSize);
        var sum = 0h;
        for (var j = 0u; (j < inputSize); j++) {
          sum = fma(input[j], weights[(weightsOffset + j)], sum);
        }
        let total = (sum + biases[i]);
        output[i] = relu(total);
      }

      enable subgroups;
      enable f16;

      @group(0) @binding(1) var<storage, read_write> output: array<f16>;

      @group(0) @binding(0) var<storage, read> input: array<f16>;

      @group(1) @binding(0) var<storage, read> weights: array<f16>;

      @group(1) @binding(1) var<storage, read> biases: array<f16>;

      fn relu(x: f16) -> f16 {
        return max(0h, x);
      }

      @compute @workgroup_size(64) fn subgroupCompute(@builtin(workgroup_id) wid: vec3u, @builtin(subgroup_invocation_id) sid: u32, @builtin(subgroup_id) sgid: u32, @builtin(subgroup_size) subgroupSize: u32) {
        let outLen = arrayLength(&output);
        let inputSize = arrayLength(&input);
        let neuronIndex = wid.x;
        let valid = ((sgid == 0u) && (neuronIndex < outLen));
        var partial = 0h;
        if (valid) {
          let weightsOffset = (neuronIndex * inputSize);
          for (var j = sid; (j < inputSize); j += subgroupSize) {
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
