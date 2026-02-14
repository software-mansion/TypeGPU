/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('bitonic sort example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'algorithms',
        name: 'bitonic-sort',
        controlTriggers: ['Sort'],
        expectedCalls: 4,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct copyParamsType {
        srcLength: u32,
        dstLength: u32,
        paddingValue: u32,
      }

      @group(0) @binding(2) var<uniform> params: copyParamsType;

      @group(0) @binding(1) var<storage, read_write> dst: array<u32>;

      @group(0) @binding(0) var<storage, read> src: array<u32>;

      struct copyPadKernel_Input {
        @builtin(global_invocation_id) gid: vec3u,
        @builtin(num_workgroups) numWorkgroups: vec3u,
      }

      @compute @workgroup_size(256) fn copyPadKernel(input: copyPadKernel_Input) {
        let spanX = (input.numWorkgroups.x * 256u);
        let spanY = (input.numWorkgroups.y * spanX);
        let idx = ((input.gid.x + (input.gid.y * spanX)) + (input.gid.z * spanY));
        let dstLength = params.dstLength;
        let srcLength = params.srcLength;
        if ((idx >= dstLength)) {
          return;
        }
        dst[idx] = select(params.paddingValue, src[idx], (idx < srcLength));
      }

      struct sortUniformsType {
        k: u32,
        jShift: u32,
      }

      @group(0) @binding(1) var<uniform> uniforms: sortUniformsType;

      @group(0) @binding(0) var<storage, read_write> data: array<u32>;

      fn defaultCompare(a: u32, b: u32) -> bool {
        return (a < b);
      }

      struct bitonicStepKernel_Input {
        @builtin(global_invocation_id) gid: vec3u,
        @builtin(num_workgroups) numWorkgroups: vec3u,
      }

      @compute @workgroup_size(256) fn bitonicStepKernel(input: bitonicStepKernel_Input) {
        let spanX = (input.numWorkgroups.x * 256u);
        let spanY = (input.numWorkgroups.y * spanX);
        let tid = ((input.gid.x + (input.gid.y * spanX)) + (input.gid.z * spanY));
        let k = uniforms.k;
        let shift = uniforms.jShift;
        let dataLength = arrayLength(&data);
        let stride = (1u << shift);
        let maskBelow = (stride - 1u);
        let below = (tid & maskBelow);
        let above = (tid >> shift);
        let i = (below + (above * (stride << 1u)));
        let ixj = (i + stride);
        if ((ixj >= dataLength)) {
          return;
        }
        let ascending = ((i & k) == 0u);
        let left = data[i];
        let right = data[ixj];
        let leftFirst = defaultCompare(left, right);
        let shouldSwap = select(leftFirst, !leftFirst, ascending);
        if (shouldSwap) {
          data[i] = right;
          data[ixj] = left;
        }
      }

      struct copyParamsType {
        srcLength: u32,
        dstLength: u32,
        paddingValue: u32,
      }

      @group(0) @binding(2) var<uniform> params: copyParamsType;

      @group(0) @binding(1) var<storage, read_write> dst: array<u32>;

      @group(0) @binding(0) var<storage, read> src: array<u32>;

      struct copyBackKernel_Input {
        @builtin(global_invocation_id) gid: vec3u,
        @builtin(num_workgroups) numWorkgroups: vec3u,
      }

      @compute @workgroup_size(256) fn copyBackKernel(input: copyBackKernel_Input) {
        let spanX = (input.numWorkgroups.x * 256u);
        let spanY = (input.numWorkgroups.y * spanX);
        let idx = ((input.gid.x + (input.gid.y * spanX)) + (input.gid.z * spanY));
        if ((idx < params.srcLength)) {
          dst[idx] = src[idx];
        }
      }

      struct fullScreenTriangle_Input {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(in: fullScreenTriangle_Input) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[in.vertexIndex], 0, 1), uv[in.vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> initLength: u32;

      @group(1) @binding(0) var<storage, read> data: array<u32>;

      struct fragmentFn_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentFn(input: fragmentFn_Input) -> @location(0) vec4f {
        let arrayLength_1 = initLength;
        let cols = u32(round(sqrt(f32(arrayLength_1))));
        let rows = u32(round((f32(arrayLength_1) / f32(cols))));
        let col = u32(floor((input.uv.x * f32(cols))));
        let row = u32(floor((input.uv.y * f32(rows))));
        let idx = ((row * cols) + col);
        if ((idx >= arrayLength_1)) {
          return vec4f(0.10000000149011612, 0.10000000149011612, 0.10000000149011612, 1);
        }
        let value = data[idx];
        let normalized = (f32(value) / 255f);
        return vec4f(normalized, normalized, normalized, 1f);
      }"
    `);
  });
});
