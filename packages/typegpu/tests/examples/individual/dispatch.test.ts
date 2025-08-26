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
      expectedCalls: 5,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct item_1 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @group(0) @binding(0) var<storage, read_write> mutable_3: array<u32, 7>;

      fn wrappedCallback_2(x: u32, _arg_1: u32, _arg_2: u32) {
        mutable_3[x] = x;
      }

      @compute @workgroup_size(1, 1, 1) fn item_0(_arg_0: item_1) {
        if (any((_arg_0.id >= vec3u(7, 1, 1)))) {
          return;
        }
        wrappedCallback_2(_arg_0.id.x, _arg_0.id.y, _arg_0.id.z);
      }

      struct item_5 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @group(0) @binding(0) var<storage, read_write> mutable_7: array<array<vec2u, 3>, 2>;

      fn wrappedCallback_6(x: u32, y: u32, _arg_2: u32) {
        mutable_7[x][y] = vec2u(x, y);
      }

      @compute @workgroup_size(1, 1, 1) fn item_4(_arg_0: item_5) {
        if (any((_arg_0.id >= vec3u(2, 3, 1)))) {
          return;
        }
        wrappedCallback_6(_arg_0.id.x, _arg_0.id.y, _arg_0.id.z);
      }

      struct item_9 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @group(0) @binding(0) var<storage, read_write> mutable_11: array<array<array<vec3u, 2>, 1>, 2>;

      fn wrappedCallback_10(x: u32, y: u32, z: u32) {
        mutable_11[x][y][z] = vec3u(x, y, z);
      }

      @compute @workgroup_size(1, 1, 1) fn item_8(_arg_0: item_9) {
        if (any((_arg_0.id >= vec3u(2, 1, 2)))) {
          return;
        }
        wrappedCallback_10(_arg_0.id.x, _arg_0.id.y, _arg_0.id.z);
      }

      struct item_13 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @group(0) @binding(0) var<storage, read_write> mutable_15: array<u32, 12>;

      fn wrappedCallback_14(x: u32, _arg_1: u32, _arg_2: u32) {
        mutable_15[x] = x;
      }

      @compute @workgroup_size(3, 1, 1) fn item_12(_arg_0: item_13) {
        if (any((_arg_0.id >= vec3u(5, 1, 1)))) {
          return;
        }
        wrappedCallback_14(_arg_0.id.x, _arg_0.id.y, _arg_0.id.z);
      }

      struct item_17 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @group(0) @binding(0) var<storage, read_write> mutable_19: array<u32, 7>;

      fn wrappedCallback_18(x: u32, _arg_1: u32, _arg_2: u32) {
        mutable_19[x] *= 2;
      }

      @compute @workgroup_size(1, 1, 1) fn item_16(_arg_0: item_17) {
        if (any((_arg_0.id >= vec3u(7, 1, 1)))) {
          return;
        }
        wrappedCallback_18(_arg_0.id.x, _arg_0.id.y, _arg_0.id.z);
      }"
    `);
  });
});
