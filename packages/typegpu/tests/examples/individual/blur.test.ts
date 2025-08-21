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
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Settings_1 {
        filterDim: i32,
        blockDim: u32,
      }

      @group(0) @binding(0) var<uniform> settings_0: Settings_1;

      @group(0) @binding(1) var sampling_2: sampler;

      @group(1) @binding(0) var<uniform> flip_3: u32;

      @group(1) @binding(1) var inTexture_4: texture_2d<f32>;

      @group(1) @binding(2) var outTexture_5: texture_storage_2d<rgba8unorm, write>;

      var<workgroup> tile: array<array<vec3f, 128>, 4>;

      @compute @workgroup_size(32, 1)
      fn main(@builtin(workgroup_id) wid: vec3u, @builtin(local_invocation_id) lid: vec3u) {
        let filterOffset = (settings_0.filterDim - 1) / 2;
        let dims = vec2i(textureDimensions(inTexture_4, 0));
        let baseIndex = vec2i(wid.xy * vec2(settings_0.blockDim, 4) +
                                  lid.xy * vec2(4, 1))
                        - vec2(filterOffset, 0);

        for (var r = 0; r < 4; r++) {
          for (var c = 0; c < 4; c++) {
            var loadIndex = baseIndex + vec2(c, r);
            if (flip_3 != 0) {
              loadIndex = loadIndex.yx;
            }

            tile[r][4 * lid.x + u32(c)] = textureSampleLevel(
              inTexture_4,
              sampling_2,
              (vec2f(loadIndex) + vec2f(0.25, 0.25)) / vec2f(dims),
              0.0
            ).rgb;
          }
        }

        workgroupBarrier();

        for (var r = 0; r < 4; r++) {
          for (var c = 0; c < 4; c++) {
            var writeIndex = baseIndex + vec2(c, r);
            if (flip_3 != 0) {
              writeIndex = writeIndex.yx;
            }

            let center = i32(4 * lid.x) + c;
            if (center >= filterOffset &&
                center < 128 - filterOffset &&
                all(writeIndex < dims)) {
              var acc = vec3(0.0, 0.0, 0.0);
              for (var f = 0; f < settings_0.filterDim; f++) {
                var i = center + f - filterOffset;
                acc = acc + (1.0 / f32(settings_0.filterDim)) * tile[r][i];
              }
              textureStore(outTexture_5, writeIndex, vec4(acc, 1.0));
            }
          }
        }
      }

      struct VertexOutput_0 {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      }

      @group(0) @binding(0) var texture_1: texture_2d<f32>;

      @group(0) @binding(1) var sampling_2: sampler;

      @vertex
      fn main_vert(@builtin(vertex_index) index: u32) -> VertexOutput_0 {
        const pos = array(
          vec2( 1.0,  1.0),
          vec2( 1.0, -1.0),
          vec2(-1.0, -1.0),
          vec2( 1.0,  1.0),
          vec2(-1.0, -1.0),
          vec2(-1.0,  1.0),
        );

        const uv = array(
          vec2(1.0, 0.0),
          vec2(1.0, 1.0),
          vec2(0.0, 1.0),
          vec2(1.0, 0.0),
          vec2(0.0, 1.0),
          vec2(0.0, 0.0),
        );

        var output: VertexOutput_0;
        output.position = vec4(pos[index], 0.0, 1.0);
        output.uv = uv[index];
        return output;
      }

      @fragment
      fn main_frag(@location(0) uv: vec2f) -> @location(0) vec4f {
        return textureSample(texture_1, sampling_2, uv);
      }"
    `);
  });
});
