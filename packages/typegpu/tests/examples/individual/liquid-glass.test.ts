/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockImageLoading, mockResizeObserver } from '../utils/commonMocks.ts';

describe('liquid-glass example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simple',
      name: 'liquid-glass',
      setupMocks: () => {
        mockResizeObserver();
        mockImageLoading();
      },
      expectedCalls: 3,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "
      struct VertexOutput {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex
      fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
        let pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        let uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        var output: VertexOutput;
        output.pos = vec4f(pos[vertexIndex], 0, 1);
        output.uv = uv[vertexIndex];
        return output;
      }
            


      @group(0) @binding(0) var inputTexture: texture_2d<f32>;
      @group(0) @binding(1) var inputSampler: sampler;

      @fragment
      fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
        return textureSample(inputTexture, inputSampler, uv);
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

      @group(0) @binding(0) var<uniform> mousePosUniform_4: vec2f;

      struct Params_6 {
        rectDims: vec2f,
        radius: f32,
        start: f32,
        end: f32,
        chromaticStrength: f32,
        refractionStrength: f32,
        blur: f32,
        edgeFeather: f32,
        edgeBlurMultiplier: f32,
        tintStrength: f32,
        tintColor: vec3f,
      }

      @group(0) @binding(1) var<uniform> paramsUniform_5: Params_6;

      fn sdRoundedBox2d_7(p: vec2f, size: vec2f, cornerRadius: f32) -> f32 {
        var d = ((abs(p) - size) + vec2f(cornerRadius));
        return ((length(max(d, vec2f())) + min(max(d.x, d.y), 0f)) - cornerRadius);
      }

      @group(0) @binding(2) var sampledView_8: texture_2d<f32>;

      struct Weights_10 {
        inside: f32,
        ring: f32,
        outside: f32,
      }

      fn calculateWeights_9(sdfDist: f32, start: f32, end: f32, featherUV: f32) -> Weights_10 {
        let inside = (1f - smoothstep((start - featherUV), (start + featherUV), sdfDist));
        let outside = smoothstep((end - featherUV), (end + featherUV), sdfDist);
        let ring = max(0f, ((1f - inside) - outside));
        return Weights_10(inside, ring, outside);
      }

      @group(0) @binding(3) var sampler_11: sampler;

      fn sampleWithChromaticAberration_12(tex: texture_2d<f32>, sampler2: sampler, uv: vec2f, offset: f32, dir: vec2f, blur: f32) -> vec3f {
        var samples = array<vec3f, 3>();
        for (var i = 0; (i < 3i); i++) {
          var channelOffset = (dir * ((f32(i) - 1f) * offset));
          samples[i] = textureSampleBias(tex, sampler2, (uv - channelOffset), blur).xyz;
        }
        return vec3f(samples[0i].x, samples[1i].y, samples[2i].z);
      }

      struct TintParams_13 {
        color: vec3f,
        strength: f32,
      }

      fn applyTint_14(color: vec3f, tint: TintParams_13) -> vec4f {
        return mix(vec4f(color, 1f), vec4f(tint.color, 1f), tint.strength);
      }

      struct fragmentShader_Input_15 {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentShader_3(_arg_0: fragmentShader_Input_15) -> @location(0) vec4f {
        var posInBoxSpace = (_arg_0.uv - mousePosUniform_4);
        let sdfDist = sdRoundedBox2d_7(posInBoxSpace, paramsUniform_5.rectDims, paramsUniform_5.radius);
        var dir = normalize((posInBoxSpace * paramsUniform_5.rectDims.yx));
        let normalizedDist = ((sdfDist - paramsUniform_5.start) / (paramsUniform_5.end - paramsUniform_5.start));
        var texDim = textureDimensions(sampledView_8, 0);
        let featherUV = (paramsUniform_5.edgeFeather / f32(max(texDim.x, texDim.y)));
        var weights = calculateWeights_9(sdfDist, paramsUniform_5.start, paramsUniform_5.end, featherUV);
        var blurSample = textureSampleBias(sampledView_8, sampler_11, _arg_0.uv, paramsUniform_5.blur);
        var refractedSample = sampleWithChromaticAberration_12(sampledView_8, sampler_11, (_arg_0.uv + (dir * (paramsUniform_5.refractionStrength * normalizedDist))), (paramsUniform_5.chromaticStrength * normalizedDist), dir, (paramsUniform_5.blur * paramsUniform_5.edgeBlurMultiplier));
        var normalSample = textureSampleLevel(sampledView_8, sampler_11, _arg_0.uv, 0);
        var tint = TintParams_13(paramsUniform_5.tintColor, paramsUniform_5.tintStrength);
        var tintedBlur = applyTint_14(blurSample.xyz, tint);
        var tintedRing = applyTint_14(refractedSample, tint);
        return (((tintedBlur * weights.inside) + (tintedRing * weights.ring)) + (normalSample * weights.outside));
      }"
    `);
  });
});
