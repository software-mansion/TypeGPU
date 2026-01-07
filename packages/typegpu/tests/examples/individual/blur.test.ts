/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import {
  mockCreateImageBitmap,
  mockImageLoading,
} from '../utils/commonMocks.ts';

describe('blur example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'image-processing',
      name: 'blur',
      setupMocks: () => {
        mockImageLoading();
        mockCreateImageBitmap();
      },
      expectedCalls: 2,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Settings {
        filterDim: i32,
        blockDim: u32,
      }

      @group(0) @binding(0) var<uniform> settingsUniform: Settings;

      @group(1) @binding(1) var inTexture: texture_2d<f32>;

      @group(1) @binding(0) var<uniform> flip: u32;

      var<workgroup> tileData: array<array<vec3f, 128>, 4>;

      @group(0) @binding(1) var sampler_1: sampler;

      @group(1) @binding(2) var outTexture: texture_storage_2d<rgba8unorm, write>;

      struct computeFn_Input {
        @builtin(workgroup_id) wid: vec3u,
        @builtin(local_invocation_id) lid: vec3u,
      }

      @compute @workgroup_size(32, 1, 1) fn computeFn(_arg_0: computeFn_Input) {
        let settings2 = (&settingsUniform);
        let filterOffset = i32((f32(((*settings2).filterDim - 1i)) / 2f));
        var dims = vec2i(textureDimensions(inTexture));
        var baseIndex = (vec2i(((_arg_0.wid.xy * vec2u((*settings2).blockDim, 4u)) + (_arg_0.lid.xy * vec2u(4, 1)))) - vec2i(filterOffset, 0i));
        for (var r = 0; (r < 4i); r++) {
          for (var c = 0; (c < 4i); c++) {
            var loadIndex = (baseIndex + vec2i(c, r));
            if ((flip != 0u)) {
              loadIndex = loadIndex.yx;
            }
            tileData[r][((_arg_0.lid.x * 4u) + u32(c))] = textureSampleLevel(inTexture, sampler_1, ((vec2f(loadIndex) + vec2f(0.5)) / vec2f(dims)), 0).xyz;
          }
        }
        workgroupBarrier();
        for (var r = 0; (r < 4i); r++) {
          for (var c = 0; (c < 4i); c++) {
            var writeIndex = (baseIndex + vec2i(c, r));
            if ((flip != 0u)) {
              writeIndex = writeIndex.yx;
            }
            let center = (i32((4u * _arg_0.lid.x)) + c);
            if ((((center >= filterOffset) && (center < (128i - filterOffset))) && all((writeIndex < dims)))) {
              var acc = vec3f();
              for (var f = 0; (f < (*settings2).filterDim); f++) {
                let i = ((center + f) - filterOffset);
                acc = (acc + (tileData[r][i] * (1f / f32((*settings2).filterDim))));
              }
              textureStore(outTexture, writeIndex, vec4f(acc, 1f));
            }
          }
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

      @group(0) @binding(0) var renderView: texture_2d<f32>;

      @group(0) @binding(1) var sampler_1: sampler;

      struct renderFragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn renderFragment(input: renderFragment_Input) -> @location(0) vec4f {
        return textureSample(renderView, sampler_1, input.uv);
      }"
    `);
  });
});
