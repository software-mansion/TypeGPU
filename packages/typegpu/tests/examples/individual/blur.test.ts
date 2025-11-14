/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockImageLoading } from '../utils/commonMocks.ts';

describe('blur example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'image-processing',
      name: 'blur',
      setupMocks: mockImageLoading,
      expectedCalls: 2,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Settings_2 {
        filterDim: i32,
        blockDim: u32,
      }

      @group(0) @binding(0) var<uniform> settingsUniform_1: Settings_2;

      @group(1) @binding(1) var inTexture_3: texture_2d<f32>;

      @group(1) @binding(0) var<uniform> flip_4: u32;

      var<workgroup> tileData_5: array<array<vec3f, 128>, 4>;

      @group(0) @binding(1) var sampler_6: sampler;

      @group(1) @binding(2) var outTexture_7: texture_storage_2d<rgba8unorm, write>;

      struct computeFn_Input_8 {
        @builtin(workgroup_id) wid: vec3u,
        @builtin(local_invocation_id) lid: vec3u,
      }

      @compute @workgroup_size(32, 1, 1) fn computeFn_0(_arg_0: computeFn_Input_8) {
        let settings2 = (&settingsUniform_1);
        let filterOffset = i32((f32(((*settings2).filterDim - 1i)) / 2f));
        var dims = vec2i(textureDimensions(inTexture_3));
        var baseIndex = (vec2i(((_arg_0.wid.xy * vec2u((*settings2).blockDim, 4u)) + (_arg_0.lid.xy * vec2u(4, 1)))) - vec2i(filterOffset, 0i));
        for (var r = 0; (r < 4i); r++) {
          for (var c = 0; (c < 4i); c++) {
            var loadIndex = (baseIndex + vec2i(c, r));
            if ((flip_4 != 0u)) {
              loadIndex = loadIndex.yx;
            }
            tileData_5[r][((_arg_0.lid.x * 4u) + u32(c))] = textureSampleLevel(inTexture_3, sampler_6, ((vec2f(loadIndex) + vec2f(0.5)) / vec2f(dims)), 0).xyz;
          }
        }
        workgroupBarrier();
        for (var r = 0; (r < 4i); r++) {
          for (var c = 0; (c < 4i); c++) {
            var writeIndex = (baseIndex + vec2i(c, r));
            if ((flip_4 != 0u)) {
              writeIndex = writeIndex.yx;
            }
            let center = (i32((4u * _arg_0.lid.x)) + c);
            if ((((center >= filterOffset) && (center < (128i - filterOffset))) && all((writeIndex < dims)))) {
              var acc = vec3f();
              for (var f = 0; (f < (*settings2).filterDim); f++) {
                let i = ((center + f) - filterOffset);
                acc = (acc + (tileData_5[r][i] * (1f / f32((*settings2).filterDim))));
              }
              textureStore(outTexture_7, writeIndex, vec4f(acc, 1f));
            }
          }
        }
      }

      struct fullScreenTriangle_Input_1 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct fullScreenTriangle_Output_2 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle_0(in: fullScreenTriangle_Input_1) -> fullScreenTriangle_Output_2 {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output_2(vec4f(pos[in.vertexIndex], 0, 1), uv[in.vertexIndex]);
      }

      @group(0) @binding(0) var renderView_4: texture_2d<f32>;

      @group(0) @binding(1) var sampler_5: sampler;

      struct renderFragment_Input_6 {
        @location(0) uv: vec2f,
      }

      @fragment fn renderFragment_3(input: renderFragment_Input_6) -> @location(0) vec4f {
        return textureSample(renderView_4, sampler_5, input.uv);
      }"
    `);
  });
});
