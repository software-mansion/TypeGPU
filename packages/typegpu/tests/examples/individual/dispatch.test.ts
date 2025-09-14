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
      "@group(0) @binding(0) var<storage, read_write> mutable_2: u32;

      fn wrappedCallback_1(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        mutable_2 = 126;
      }

      struct mainCompute_Input_3 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_3)  {
          if (any(in.id >= sizeUniform)) {
            return;
          }
          wrappedCallback_1(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<storage, read_write> mutable_6: array<u32, 7>;

      fn wrappedCallback_5(x: u32, _arg_1: u32, _arg_2: u32) {
        mutable_6[x] = x;
      }

      struct mainCompute_Input_7 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute_4(in: mainCompute_Input_7)  {
          if (any(in.id >= sizeUniform)) {
            return;
          }
          wrappedCallback_5(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<storage, read_write> mutable_10: array<array<vec2u, 3>, 2>;

      fn wrappedCallback_9(x: u32, y: u32, _arg_2: u32) {
        mutable_10[x][y] = vec2u(x, y);
      }

      struct mainCompute_Input_11 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute_8(in: mainCompute_Input_11)  {
          if (any(in.id >= sizeUniform)) {
            return;
          }
          wrappedCallback_9(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<storage, read_write> mutable_14: array<array<array<vec3u, 2>, 1>, 2>;

      fn wrappedCallback_13(x: u32, y: u32, z: u32) {
        mutable_14[x][y][z] = vec3u(x, y, z);
      }

      struct mainCompute_Input_15 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(8, 8, 4) fn mainCompute_12(in: mainCompute_Input_15)  {
          if (any(in.id >= sizeUniform)) {
            return;
          }
          wrappedCallback_13(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<storage, read_write> mutable_18: atomic<u32>;

      fn wrappedCallback_17(x: u32, y: u32, z: u32) {
        atomicAdd(&mutable_18, 1);
      }

      struct mainCompute_Input_19 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(8, 8, 4) fn mainCompute_16(in: mainCompute_Input_19)  {
          if (any(in.id >= sizeUniform)) {
            return;
          }
          wrappedCallback_17(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<storage, read_write> mutable_22: array<u32, 7>;

      fn wrappedCallback_21(x: u32, _arg_1: u32, _arg_2: u32) {
        mutable_22[x] *= 2;
      }

      struct mainCompute_Input_23 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute_20(in: mainCompute_Input_23)  {
          if (any(in.id >= sizeUniform)) {
            return;
          }
          wrappedCallback_21(in.id.x, in.id.y, in.id.z);
        }"
    `);
  });
});
