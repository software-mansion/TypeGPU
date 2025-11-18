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
      "@group(0) @binding(0) var sampling: sampler;

      @group(0) @binding(1) var<uniform> threshold: f32;

      @group(0) @binding(2) var<uniform> uvTransform: mat2x2f;

      @group(1) @binding(0) var inputTexture: texture_external;

      struct VertexOutput {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex
      fn main_vert(@builtin(vertex_index) idx: u32) -> VertexOutput {
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

        var output: VertexOutput;
        output.position = vec4(pos[idx], 0.0, 1.0);
        output.uv = uv[idx];
        return output;
      }

      @fragment
      fn main_frag(@location(0) uv: vec2f) -> @location(0) vec4f {
        let uv2 = uvTransform * (uv - vec2f(0.5)) + vec2f(0.5);
        var color = textureSampleBaseClampToEdge(inputTexture, sampling, uv2);
        let grey = 0.299*color.r + 0.587*color.g + 0.114*color.b;

        if (grey < threshold) {
          return vec4f(0, 0, 0, 1);
        }
        return col;
      }"
    `);
  });
});
