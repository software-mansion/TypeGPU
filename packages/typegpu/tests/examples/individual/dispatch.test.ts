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
      "@group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      @group(0) @binding(1) var<storage, read_write> mutable_3: u32;

      fn wrappedCallback_2(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        mutable_3 = 126;
      }

      struct mainCompute_Input_4 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_4)  {
          if (any(in.id >= sizeUniform_1)) {
            return;
          }
          wrappedCallback_2(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_6: vec3u;

      @group(0) @binding(1) var<storage, read_write> mutable_8: array<u32, 7>;

      fn wrappedCallback_7(x: u32, _arg_1: u32, _arg_2: u32) {
        mutable_8[x] = x;
      }

      struct mainCompute_Input_9 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute_5(in: mainCompute_Input_9)  {
          if (any(in.id >= sizeUniform_6)) {
            return;
          }
          wrappedCallback_7(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_11: vec3u;

      @group(0) @binding(1) var<storage, read_write> mutable_13: array<array<vec2u, 3>, 2>;

      fn wrappedCallback_12(x: u32, y: u32, _arg_2: u32) {
        mutable_13[x][y] = vec2u(x, y);
      }

      struct mainCompute_Input_14 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute_10(in: mainCompute_Input_14)  {
          if (any(in.id >= sizeUniform_11)) {
            return;
          }
          wrappedCallback_12(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_16: vec3u;

      @group(0) @binding(1) var<storage, read_write> mutable_18: array<array<array<vec3u, 2>, 1>, 2>;

      fn wrappedCallback_17(x: u32, y: u32, z: u32) {
        mutable_18[x][y][z] = vec3u(x, y, z);
      }

      struct mainCompute_Input_19 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(8, 8, 4) fn mainCompute_15(in: mainCompute_Input_19)  {
          if (any(in.id >= sizeUniform_16)) {
            return;
          }
          wrappedCallback_17(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_21: vec3u;

      @group(0) @binding(1) var<storage, read_write> mutable_23: atomic<u32>;

      fn wrappedCallback_22(x: u32, y: u32, z: u32) {
        atomicAdd(&mutable_23, 1);
      }

      struct mainCompute_Input_24 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(8, 8, 4) fn mainCompute_20(in: mainCompute_Input_24)  {
          if (any(in.id >= sizeUniform_21)) {
            return;
          }
          wrappedCallback_22(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_26: vec3u;

      @group(0) @binding(1) var<storage, read_write> mutable_28: array<u32, 7>;

      fn wrappedCallback_27(x: u32, _arg_1: u32, _arg_2: u32) {
        mutable_28[x] *= 2;
      }

      struct mainCompute_Input_29 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute_25(in: mainCompute_Input_29)  {
          if (any(in.id >= sizeUniform_26)) {
            return;
          }
          wrappedCallback_27(in.id.x, in.id.y, in.id.z);
        }"
    `);
  });
});
