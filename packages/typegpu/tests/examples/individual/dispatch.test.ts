/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('tgsl parsing test example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'tests',
        name: 'dispatch',
        expectedCalls: 9,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> mutable_1: u32;

      fn wrappedCallback(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        mutable_1 = 126u;
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> mutable_1: array<u32, 7>;

      fn wrappedCallback(x: u32, _arg_1: u32, _arg_2: u32) {
        mutable_1[x] = x;
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> mutable_1: array<array<vec2u, 3>, 2>;

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        mutable_1[x][y] = vec2u(x, y);
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> mutable_1: array<array<array<vec3u, 2>, 1>, 2>;

      fn wrappedCallback(x: u32, y: u32, z: u32) {
        mutable_1[x][y][z] = vec3u(x, y, z);
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(8, 8, 4) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> mutable_1: atomic<u32>;

      fn wrappedCallback(_x: u32, _y: u32, _z: u32) {
        atomicAdd(&mutable_1, 1u);
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(8, 8, 4) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> mutable_1: array<u32, 7>;

      fn wrappedCallback(x: u32, _arg_1: u32, _arg_2: u32) {
        mutable_1[x] *= 2u;
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(1) @binding(0) var<storage, read_write> buffer: array<u32>;

      fn wrappedCallback(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        for (var i = 0u; (i < arrayLength((&buffer))); i++) {
          buffer[i] *= 2u;
        }
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> result: f32;

      fn main(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        result += 1f;
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        main(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> result: f32;

      fn main(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        result += 3f;
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        main(in.id.x, in.id.y, in.id.z);
      }"
    `);
  });
});
