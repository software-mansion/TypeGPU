/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockCreateImageBitmap, mockImageLoading } from '../utils/commonMocks.ts';

describe('image tuning example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'image-processing',
        name: 'image-tuning',
        setupMocks: () => {
          mockImageLoading();
          mockCreateImageBitmap();
        },
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

      @group(0) @binding(0) var imageView: texture_2d<f32>;

      @group(0) @binding(1) var imageSampler: sampler;

      struct LUTParams {
        size: f32,
        min: vec3f,
        max: vec3f,
        enabled: u32,
      }

      @group(0) @binding(2) var<uniform> lut: LUTParams;

      @group(1) @binding(0) var currentLUTTexture: texture_3d<f32>;

      @group(0) @binding(3) var lutSampler: sampler;

      struct Adjustments {
        exposure: f32,
        contrast: f32,
        highlights: f32,
        shadows: f32,
        saturation: f32,
      }

      @group(0) @binding(4) var<uniform> adjustments: Adjustments;

      struct fragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: fragment_Input) -> @location(0) vec4f {
        var color = textureSample(imageView, imageSampler, _arg_0.uv).rgb;
        let inputLuminance = dot(color, vec3f(0.29899999499320984, 0.5870000123977661, 0.11400000005960464));
        var normColor = saturate(((color - lut.min) / (lut.max - lut.min)));
        var lutColor = select(color, textureSampleLevel(currentLUTTexture, lutSampler, normColor, 0).rgb, bool(lut.enabled));
        var lutColorNormalized = saturate(lutColor);
        let exposureBiased = (adjustments.exposure * 0.25f);
        var exposureColor = clamp((lutColorNormalized * pow(2f, exposureBiased)), vec3f(), vec3f(2));
        let exposureLuminance = clamp((inputLuminance * pow(2f, exposureBiased)), 0f, 2f);
        var contrastColor = (((exposureColor - 0.5f) * adjustments.contrast) + 0.5f);
        let contrastLuminance = (((exposureLuminance - 0.5f) * adjustments.contrast) + 0.5f);
        let contrastColorLuminance = dot(contrastColor, vec3f(0.29899999499320984, 0.5870000123977661, 0.11400000005960464));
        let highlightShift = (adjustments.highlights - 1f);
        let highlightBiased = select((highlightShift * 0.25f), highlightShift, (adjustments.highlights >= 1f));
        let highlightFactor = (1f + ((highlightBiased * 0.5f) * contrastColorLuminance));
        let highlightWeight = smoothstep(0.5f, 1f, contrastColorLuminance);
        let highlightLuminanceAdjust = (contrastLuminance * highlightFactor);
        let highlightLuminance = mix(contrastLuminance, saturate(highlightLuminanceAdjust), highlightWeight);
        var highlightColor = mix(contrastColor, saturate((contrastColor * highlightFactor)), highlightWeight);
        let shadowWeight = (1f - contrastColorLuminance);
        var shadowAdjust = pow(highlightColor, vec3f((1f / adjustments.shadows)));
        let shadowLuminanceAdjust = pow(highlightLuminance, (1f / adjustments.shadows));
        var toneColor = mix(highlightColor, shadowAdjust, shadowWeight);
        let toneLuminance = mix(highlightLuminance, shadowLuminanceAdjust, shadowWeight);
        var finalToneColor = saturate(toneColor);
        var grayscaleColor = vec3f(toneLuminance);
        var finalColor = mix(grayscaleColor, finalToneColor, adjustments.saturation);
        return vec4f(finalColor, 1f);
      }"
    `);
  });
});
