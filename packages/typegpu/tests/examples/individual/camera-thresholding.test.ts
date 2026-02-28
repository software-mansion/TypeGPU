/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('camera thresholding example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'image-processing',
        name: 'camera-thresholding',
        expectedCalls: 1,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct fullScreenTriangle_Input {
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

      @group(0) @binding(0) var<uniform> uvTransformUniform: mat2x2f;

      @group(1) @binding(0) var inputTexture: texture_external;

      @group(0) @binding(1) var sampler_1: sampler;

      const rgbToYcbcrMatrix: mat3x3f = mat3x3f(0.29899999499320984, 0.5870000123977661, 0.11400000005960464, -0.16873599588871002, -0.3312639892101288, 0.5, 0.5, -0.41868799924850464, -0.08131200075149536);

      @group(0) @binding(2) var<uniform> colorUniform: vec3f;

      @group(0) @binding(3) var<uniform> thresholdBuffer: f32;

      struct mainFrag_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFrag(input: mainFrag_Input) -> @location(0) vec4f {
        var uv2 = ((uvTransformUniform * (input.uv - 0.5f)) + 0.5f);
        var col = textureSampleBaseClampToEdge(inputTexture, sampler_1, uv2);
        var ycbcr = (col.rgb * rgbToYcbcrMatrix);
        var colycbcr = (colorUniform * rgbToYcbcrMatrix);
        let crDiff = abs((ycbcr.y - colycbcr.y));
        let cbDiff = abs((ycbcr.z - colycbcr.z));
        let distance_1 = length(vec2f(crDiff, cbDiff));
        if ((distance_1 < pow(thresholdBuffer, 2f))) {
          col = vec4f();
        }
        return col;
      }"
    `);
  });
});
