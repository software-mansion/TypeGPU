/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('chroma keying example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'image-processing',
      name: 'chroma-keying',
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var sampling_0: sampler;

      @group(0) @binding(1) var<uniform> color_1: vec3f;

      @group(0) @binding(2) var<uniform> threshold_2: f32;

      @group(0) @binding(3) var<uniform> uvTransform_3: mat2x2f;

      @group(1) @binding(0) var inputTexture_4: texture_external;

      struct VertexOutput_5 {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      }

      const rgbToYcbcrMatrix_6: mat3x3f = mat3x3f(0.29899999499320984, 0.5870000123977661, 0.11400000005960464, -0.16873599588871002, -0.3312639892101288, 0.5, 0.5, -0.41868799924850464, -0.08131200075149536);

      @vertex
      fn main_vert(@builtin(vertex_index) idx: u32) -> VertexOutput_5 {
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

        var output: VertexOutput_5;
        output.position = vec4(pos[idx], 0.0, 1.0);
        output.uv = uv[idx];
        return output;
      }

      @fragment
      fn main_frag(@location(0) uv: vec2f) -> @location(0) vec4f {
        let uv2 = uvTransform_3 * (uv - vec2f(0.5)) + vec2f(0.5);
        var col = textureSampleBaseClampToEdge(inputTexture_4, sampling_0, uv2);
        let ycbcr = col.rgb * rgbToYcbcrMatrix_6;
        let colycbcr = color_1 * rgbToYcbcrMatrix_6;

        let crDiff = abs(ycbcr.g - colycbcr.g);
        let cbDiff = abs(ycbcr.b - colycbcr.b);
        let distance = length(vec2f(crDiff, cbDiff));

        if (distance < pow(threshold_2, 2)) {
          col = vec4f();
        }

        return col;
      }

      "
    `);
  });
});
