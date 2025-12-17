/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('camera thresholding example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'image-processing',
      name: 'camera-thresholding',
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct fullScreenTriangle_Input_1 {
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

      @group(0) @binding(0) var<uniform> uvTransformUniform_4: mat2x2f;

      @group(1) @binding(0) var inputTexture_5: texture_external;

      @group(0) @binding(1) var sampler_6: sampler;

      const rgbToYcbcrMatrix_7: mat3x3f = mat3x3f(0.29899999499320984, 0.5870000123977661, 0.11400000005960464, -0.16873599588871002, -0.3312639892101288, 0.5, 0.5, -0.41868799924850464, -0.08131200075149536);

      @group(0) @binding(2) var<uniform> colorUniform_8: vec3f;

      @group(0) @binding(3) var<uniform> thresholdBuffer_9: f32;

      struct mainFrag_Input_10 {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFrag_3(input: mainFrag_Input_10) -> @location(0) vec4f {
        var uv2 = ((uvTransformUniform_4 * (input.uv - 0.5)) + 0.5);
        var col = textureSampleBaseClampToEdge(inputTexture_5, sampler_6, uv2);
        var ycbcr = (col.xyz * rgbToYcbcrMatrix_7);
        var colycbcr = (colorUniform_8 * rgbToYcbcrMatrix_7);
        let crDiff = abs((ycbcr.y - colycbcr.y));
        let cbDiff = abs((ycbcr.z - colycbcr.z));
        let distance = length(vec2f(crDiff, cbDiff));
        if ((distance < pow(thresholdBuffer_9, 2f))) {
          col = vec4f();
        }
        return col;
      }"
    `);
  });
});
