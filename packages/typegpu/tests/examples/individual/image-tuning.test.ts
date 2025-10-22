/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockImageLoading } from '../utils/commonMocks.ts';

describe('image tuning example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'image-processing',
      name: 'image-tuning',
      setupMocks: mockImageLoading,
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct VertexOutput_0 {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      }

      @group(0) @binding(0) var currentLUTTexture_1: texture_3d<f32>;

      @group(0) @binding(1) var lutSampler_2: sampler;

      struct LUTParams_4 {
        size: f32,
        min: vec3f,
        max: vec3f,
        enabled: u32,
      }

      @group(0) @binding(2) var<uniform> lut_3: LUTParams_4;

      struct Adjustments_6 {
        exposure: f32,
        contrast: f32,
        highlights: f32,
        shadows: f32,
        saturation: f32,
      }

      @group(0) @binding(3) var<uniform> adjustments_5: Adjustments_6;

      @group(1) @binding(0) var inTexture_7: texture_2d<f32>;

      @group(1) @binding(1) var inSampler_8: sampler;
      @vertex
      fn main_vert(@builtin(vertex_index) index: u32) -> VertexOutput_0 {
        const vertices = array<vec2f, 4>(
          vec2f(-1.0, -1.0), // Bottom-left
          vec2f(-1.0,  1.0), // Top-left
          vec2f( 1.0, -1.0), // Bottom-right
          vec2f( 1.0,  1.0)  // Top-right
        );

        let pos = vertices[index];
        var output: VertexOutput_0;
        output.position = vec4f(pos, 0.0, 1.0);

        output.uv = vec2f((pos.x + 1.0) * 0.5, 1.0 - (pos.y + 1.0) * 0.5);
        return output;
      }

      @fragment
      fn main_frag(@location(0) uv: vec2f) -> @location(0) vec4f {
        let color = textureSample(inTexture_7, inSampler_8, uv).rgb;
        let inputLuminance = dot(color, vec3f(0.299, 0.587, 0.114));
        let normColor = clamp((color - lut_3.min) / (lut_3.max - lut_3.min), vec3f(0.0), vec3f(1.0));

        let lutColor = select(color, textureSampleLevel(currentLUTTexture_1, lutSampler_2, normColor, 0.0).rgb, bool(lut_3.enabled));
        let lutColorNormalized = clamp(lutColor, vec3f(0.0), vec3f(1.0));

        let exposureBiased = adjustments_5.exposure * 0.25;
        let exposureColor = clamp(lutColorNormalized * pow(2.0, exposureBiased), vec3f(0.0), vec3f(2.0));
        let exposureLuminance = clamp(inputLuminance * pow(2.0, exposureBiased), 0.0, 2.0);

        let contrastColor = (exposureColor - vec3f(0.5)) * adjustments_5.contrast + vec3f(0.5);
        let contrastLuminance = (exposureLuminance - 0.5) * adjustments_5.contrast + 0.5;
        let contrastColorLuminance = dot(contrastColor, vec3f(0.299, 0.587, 0.114));

        let highlightShift = adjustments_5.highlights - 1.0;
        let highlightBiased = select(highlightShift * 0.25, highlightShift, adjustments_5.highlights >= 1.0);
        let highlightFactor = 1.0 + highlightBiased * 0.5 * contrastColorLuminance;
        let highlightWeight = smoothstep(0.5, 1.0, contrastColorLuminance);
        let highlightLuminanceAdjust = contrastLuminance * highlightFactor;
        let highlightLuminance = mix(contrastLuminance, clamp(highlightLuminanceAdjust, 0.0, 1.0), highlightWeight);
        let highlightColor = mix(contrastColor, clamp(contrastColor * highlightFactor, vec3f(0.0), vec3f(1.0)), highlightWeight);

        let shadowWeight = 1.0 - contrastColorLuminance;
        let shadowAdjust = pow(highlightColor, vec3f(1.0 / adjustments_5.shadows));
        let shadowLuminanceAdjust = pow(highlightLuminance, 1.0 / adjustments_5.shadows);

        let toneColor = mix(highlightColor, shadowAdjust, shadowWeight);
        let toneLuminance = mix(highlightLuminance, shadowLuminanceAdjust, shadowWeight);

        let finalToneColor = clamp(toneColor, vec3f(0.0), vec3f(1.0));
        let grayscaleColor = vec3f(toneLuminance);
        let finalColor = mix(grayscaleColor, finalToneColor, adjustments_5.saturation);

        return vec4f(finalColor, 1.0);
      }
      "
    `);
  });
});
