/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('tgsl parsing test example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'tests',
      name: 'dispatch',
      expectedCalls: 6,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct item_1 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @group(0) @binding(0) var<uniform> sizeUniform_2: vec3u;

      @group(0) @binding(1) var<storage, read_write> mutable_4: u32;

      fn wrappedCallback_3(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        mutable_4 = 126;
      }

      @compute @workgroup_size(1, 1, 1) fn item_0(_arg_0: item_1) {
        if (any((_arg_0.id >= sizeUniform_2))) {
          return;
        }
        wrappedCallback_3(_arg_0.id.x, _arg_0.id.y, _arg_0.id.z);
      }

      struct item_6 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @group(0) @binding(0) var<uniform> sizeUniform_7: vec3u;

      @group(0) @binding(1) var<storage, read_write> mutable_9: array<u32, 7>;

      fn wrappedCallback_8(x: u32, _arg_1: u32, _arg_2: u32) {
        mutable_9[x] = x;
      }

      @compute @workgroup_size(256, 1, 1) fn item_5(_arg_0: item_6) {
        if (any((_arg_0.id >= sizeUniform_7))) {
          return;
        }
        wrappedCallback_8(_arg_0.id.x, _arg_0.id.y, _arg_0.id.z);
      }

      struct item_11 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @group(0) @binding(0) var<uniform> sizeUniform_12: vec3u;

      @group(0) @binding(1) var<storage, read_write> mutable_14: array<array<vec2u, 3>, 2>;

      fn wrappedCallback_13(x: u32, y: u32, _arg_2: u32) {
        mutable_14[x][y] = vec2u(x, y);
      }

      @compute @workgroup_size(16, 16, 1) fn item_10(_arg_0: item_11) {
        if (any((_arg_0.id >= sizeUniform_12))) {
          return;
        }
        wrappedCallback_13(_arg_0.id.x, _arg_0.id.y, _arg_0.id.z);
      }

      struct item_16 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @group(0) @binding(0) var<uniform> sizeUniform_17: vec3u;

      @group(0) @binding(1) var<storage, read_write> mutable_19: array<array<array<vec3u, 2>, 1>, 2>;

      fn wrappedCallback_18(x: u32, y: u32, z: u32) {
        mutable_19[x][y][z] = vec3u(x, y, z);
      }

      @compute @workgroup_size(8, 8, 4) fn item_15(_arg_0: item_16) {
        if (any((_arg_0.id >= sizeUniform_17))) {
          return;
        }
        wrappedCallback_18(_arg_0.id.x, _arg_0.id.y, _arg_0.id.z);
      }

      struct item_21 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @group(0) @binding(0) var<uniform> sizeUniform_22: vec3u;

      @group(0) @binding(1) var<storage, read_write> mutable_24: atomic<u32>;

      fn wrappedCallback_23(x: u32, y: u32, z: u32) {
        atomicAdd(&mutable_24, 1);
      }

      @compute @workgroup_size(8, 8, 4) fn item_20(_arg_0: item_21) {
        if (any((_arg_0.id >= sizeUniform_22))) {
          return;
        }
        wrappedCallback_23(_arg_0.id.x, _arg_0.id.y, _arg_0.id.z);
      }

      struct item_26 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @group(0) @binding(0) var<uniform> sizeUniform_27: vec3u;

      @group(0) @binding(1) var<storage, read_write> mutable_29: array<u32, 7>;

      fn wrappedCallback_28(x: u32, _arg_1: u32, _arg_2: u32) {
        mutable_29[x] *= 2;
      }

      @compute @workgroup_size(256, 1, 1) fn item_25(_arg_0: item_26) {
        if (any((_arg_0.id >= sizeUniform_27))) {
          return;
        }
        wrappedCallback_28(_arg_0.id.x, _arg_0.id.y, _arg_0.id.z);
      }"
    `);
  });
});
