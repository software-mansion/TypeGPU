/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import {
  mockCreateImageBitmap,
  mockImageLoading,
  mockResizeObserver,
} from '../utils/commonMocks.ts';

describe('liquid-glass example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simple',
      name: 'liquid-glass',
      setupMocks: () => {
        mockResizeObserver();
        mockImageLoading();
        mockCreateImageBitmap();
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
      fn vs_main(@builtin(vertex_index) i: u32) -> VertexOutput {
        const pos = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));
        return VertexOutput(vec4f(pos[i], 0, 1), uv[i]);
      }


      @group(0) @binding(0) var src: texture_2d<f32>;
      @group(0) @binding(1) var samp: sampler;

      @fragment
      fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
        return textureSample(src, samp, uv);
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

      @group(0) @binding(0) var<uniform> mousePosUniform: vec2f;

      struct Params {
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

      @group(0) @binding(1) var<uniform> paramsUniform: Params;

      fn sdRoundedBox2d(point: vec2f, size: vec2f, cornerRadius: f32) -> f32 {
        var d = ((abs(point) - size) + vec2f(cornerRadius));
        return ((length(max(d, vec2f())) + min(max(d.x, d.y), 0f)) - cornerRadius);
      }

      @group(0) @binding(2) var sampledView: texture_2d<f32>;

      struct Weights {
        inside: f32,
        ring: f32,
        outside: f32,
      }

      fn calculateWeights(sdfDist: f32, start: f32, end: f32, featherUV: f32) -> Weights {
        let inside = (1f - smoothstep((start - featherUV), (start + featherUV), sdfDist));
        let outside = smoothstep((end - featherUV), (end + featherUV), sdfDist);
        let ring = max(0f, ((1f - inside) - outside));
        return Weights(inside, ring, outside);
      }

      @group(0) @binding(3) var sampler_1: sampler;

      fn sampleWithChromaticAberration(tex: texture_2d<f32>, sampler2: sampler, uv: vec2f, offset: f32, dir: vec2f, blur: f32) -> vec3f {
        var samples = array<vec3f, 3>();
        // unrolled iteration #0
        {
          var channelOffset = (dir * (-1f * offset));
          samples[0i] = textureSampleBias(tex, sampler2, (uv - channelOffset), blur).rgb;
        }
        // unrolled iteration #1
        {
          var channelOffset = (dir * (0f * offset));
          samples[1i] = textureSampleBias(tex, sampler2, (uv - channelOffset), blur).rgb;
        }
        // unrolled iteration #2
        {
          var channelOffset = (dir * (1f * offset));
          samples[2i] = textureSampleBias(tex, sampler2, (uv - channelOffset), blur).rgb;
        }
        return vec3f(samples[0i].x, samples[1i].y, samples[2i].z);
      }

      struct TintParams {
        color: vec3f,
        strength: f32,
      }

      fn applyTint(color: vec3f, tint: TintParams) -> vec4f {
        return mix(vec4f(color, 1f), vec4f(tint.color, 1f), tint.strength);
      }

      struct fragmentShader_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentShader(_arg_0: fragmentShader_Input) -> @location(0) vec4f {
        var posInBoxSpace = (_arg_0.uv - mousePosUniform);
        let sdfDist = sdRoundedBox2d(posInBoxSpace, paramsUniform.rectDims, paramsUniform.radius);
        var dir = normalize((posInBoxSpace * paramsUniform.rectDims.yx));
        let normalizedDist = ((sdfDist - paramsUniform.start) / (paramsUniform.end - paramsUniform.start));
        var texDim = textureDimensions(sampledView, 0);
        let featherUV = (paramsUniform.edgeFeather / f32(max(texDim.x, texDim.y)));
        var weights = calculateWeights(sdfDist, paramsUniform.start, paramsUniform.end, featherUV);
        var blurSample = textureSampleBias(sampledView, sampler_1, _arg_0.uv, paramsUniform.blur);
        var refractedSample = sampleWithChromaticAberration(sampledView, sampler_1, (_arg_0.uv + (dir * (paramsUniform.refractionStrength * normalizedDist))), (paramsUniform.chromaticStrength * normalizedDist), dir, (paramsUniform.blur * paramsUniform.edgeBlurMultiplier));
        var normalSample = textureSampleLevel(sampledView, sampler_1, _arg_0.uv, 0);
        var tint = TintParams(paramsUniform.tintColor, paramsUniform.tintStrength);
        var tintedBlur = applyTint(blurSample.rgb, tint);
        var tintedRing = applyTint(refractedSample, tint);
        return (((tintedBlur * weights.inside) + (tintedRing * weights.ring)) + (normalSample * weights.outside));
      }"
    `);
  });
});
