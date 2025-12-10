/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockResizeObserver } from '../utils/commonMocks.ts';

describe('volumetric radiance cascades example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'volumetric-radiance-cascades',
      expectedCalls: 2,
      setupMocks: () => {
        mockResizeObserver();
      },
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

      @group(0) @binding(0) var<uniform> resolutionUniform_4: vec3f;

      fn getIntervalScale_7(cascadeIndex: i32) -> f32 {
        if ((cascadeIndex <= 0i)) {
          return 0f;
        }
        return f32((1u << u32((2i * cascadeIndex))));
      }

      fn getIntervalRange_6(cascadeIndex: i32) -> vec2f {
        return (vec2f(getIntervalScale_7(cascadeIndex), getIntervalScale_7((cascadeIndex + 1i))) * 0.2);
      }

      fn circle_10(color: vec4f, position: vec2f, radius: f32, albedo: vec4f) -> vec4f {
        let sanitizedRadius = max(0.5f, radius);
        var result = color;
        if (((length(position) - sanitizedRadius) < sanitizedRadius)) {
          result = albedo;
        }
        return result;
      }

      fn getSceneColor_9(coord: vec2f, resolution: vec2f, time: f32) -> vec4f {
        var center = ((resolution.xy * 0.5) - coord);
        var color = vec4f();
        color = circle_10(color, (vec2f(-250, 0) + center), (((sin(time) * 0.5f) + 0.5f) * 50f), vec4f(1, 0.5, 0, 1));
        color = circle_10(color, (vec2f(0f, (sin(time) * 250f)) + center), 50f, vec4f(0, 0, 0, 0.009999999776482582));
        color = circle_10(color, (vec2f(250, 0) + center), (((-(sin(time)) * 0.5f) + 0.5f) * 50f), vec4f(1));
        return color;
      }

      fn castInterval_8(intervalStart: vec2f, intervalEnd: vec2f, cascadeIndex: i32, resolution: vec2f, time: f32) -> vec4f {
        var dir = (intervalEnd - intervalStart);
        let steps = (16u << u32(cascadeIndex));
        var stepSize = (dir / f32(steps));
        var radiance = vec3f();
        var transmittance = 1f;
        for (var i = 0u; (i < steps); i++) {
          var coord = (intervalStart + (stepSize * f32(i)));
          var scene = getSceneColor_9(coord, resolution, time);
          radiance = (radiance + ((scene.xyz * transmittance) * scene.w));
          transmittance *= (1f - scene.w);
        }
        return vec4f(radiance, transmittance);
      }

      fn getBilinearWeights_11(ratio: vec2f) -> vec4f {
        return vec4f(((1f - ratio.x) * (1f - ratio.y)), (ratio.x * (1f - ratio.y)), ((1f - ratio.x) * ratio.y), (ratio.x * ratio.y));
      }

      fn getBilinearOffset_12(offsetIndex: u32) -> vec2i {
        var offsets = array<vec2i, 4>(vec2i(), vec2i(1, 0), vec2i(0, 1), vec2i(1));
        return offsets[offsetIndex];
      }

      fn mergeIntervals_13(near: vec4f, far: vec4f) -> vec4f {
        var radiance = (near.xyz + (far.xyz * near.w));
        return vec4f(radiance, (near.w * far.w));
      }

      fn castAndMerge_5(texture: texture_2d<f32>, cascadeIndex: i32, fragCoord: vec2f, resolution: vec2f, time: f32, bilinearFix: u32) -> vec4f {
        let probeSize = i32((1u << u32(cascadeIndex)));
        var probeCenter = (floor((fragCoord / f32(probeSize))) + 0.5);
        var probePosition = (probeCenter * f32(probeSize));
        var dirCoord = (vec2i(fragCoord) % probeSize);
        let dirIndex = (dirCoord.x + (dirCoord.y * probeSize));
        let dirCount = (probeSize * probeSize);
        let angle = (6.283185307179586f * ((f32(dirIndex) + 0.5f) / f32(dirCount)));
        var dir = vec2f(cos(angle), sin(angle));
        var radiance = vec4f(0, 0, 0, 1);
        var intervalRange = getIntervalRange_6(cascadeIndex);
        var intervalStart = (probePosition + (dir * intervalRange.x));
        var intervalEnd = (probePosition + (dir * intervalRange.y));
        var destInterval = castInterval_8(intervalStart, intervalEnd, cascadeIndex, resolution, time);
        if ((cascadeIndex == 5i)) {
          return destInterval;
        }
        let bilinearProbeSize = i32((1u << u32((cascadeIndex + 1i))));
        var bilinearBaseCoord = ((probePosition / f32(bilinearProbeSize)) - 0.5);
        var ratio = fract(bilinearBaseCoord);
        var weights = getBilinearWeights_11(ratio);
        var baseIndex = vec2i(floor(bilinearBaseCoord));
        for (var b = 0u; (b < 4u); b++) {
          var baseOffset = getBilinearOffset_12(b);
          var bilinearIndex = clamp((baseIndex + baseOffset), vec2i(), ((vec2i(resolution) / bilinearProbeSize) - 1));
          var bilinearPosition = ((vec2f(bilinearIndex) + 0.5) * f32(bilinearProbeSize));
          if ((bilinearFix == 1u)) {
            var intervalRange2 = getIntervalRange_6(cascadeIndex);
            var intervalStart2 = (probePosition + (dir * intervalRange2.x));
            var intervalEnd2 = (bilinearPosition + (dir * intervalRange2.y));
            destInterval = castInterval_8(intervalStart2, intervalEnd2, cascadeIndex, resolution, time);
          }
          var bilinearRadiance = vec4f();
          for (var dd = 0; (dd < 4i); dd++) {
            let baseDirIndex = (dirIndex * 4i);
            let bilinearDirIndex = (baseDirIndex + dd);
            var bilinearDirCoord = vec2i((bilinearDirIndex % bilinearProbeSize), i32((f32(bilinearDirIndex) / f32(bilinearProbeSize))));
            var bilinearTexel = ((bilinearIndex * bilinearProbeSize) + bilinearDirCoord);
            var bilinearInterval = textureLoad(texture, bilinearTexel, 0);
            bilinearRadiance = (bilinearRadiance + (mergeIntervals_13(destInterval, bilinearInterval) * weights[b]));
          }
          radiance = (radiance + (bilinearRadiance * 0.25));
        }
        return radiance;
      }

      @group(1) @binding(0) var iChannel0_14: texture_2d<f32>;

      @group(0) @binding(1) var<uniform> cascadeIndexUniform_15: i32;

      @group(0) @binding(2) var<uniform> timeUniform_16: f32;

      @group(0) @binding(3) var<uniform> bilinearFix_17: u32;

      struct castAndMergeFragment_Input_18 {
        @builtin(position) pos: vec4f,
      }

      @fragment fn castAndMergeFragment_3(_arg_0: castAndMergeFragment_Input_18) -> @location(0) vec4f {
        return castAndMerge_5(iChannel0_14, cascadeIndexUniform_15, _arg_0.pos.xy, resolutionUniform_4.xy, timeUniform_16, bilinearFix_17);
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

      @group(1) @binding(0) var iChannel0_4: texture_2d<f32>;

      @group(0) @binding(0) var<uniform> luminancePostprocessing_5: u32;

      fn tonemapACES_6(colorArg: vec3f) -> vec3f {
        var color = colorArg.xyz;
        var acesInputMat = mat3x3f(0.59719, 0.076, 0.0284, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
        var acesOutputMat = mat3x3f(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
        color = (acesInputMat * color);
        var a = ((color * (color + 0.0245786)) - 9.0537e-5);
        var b = ((color * ((color * 0.983729) + 0.432951)) + 0.238081);
        color = (a / b);
        color = (acesOutputMat * color);
        return clamp(color, vec3f(), vec3f(1));
      }

      fn gammaSRGB_7(linearSRGB: vec3f) -> vec3f {
        var a = (linearSRGB * 12.92);
        var b = ((pow(linearSRGB, vec3f(0.4166666567325592)) * 1.055) - 0.055);
        var c = step(vec3f(0.0031308000907301903), linearSRGB);
        return mix(a, b, c);
      }

      struct imageFragment_Input_8 {
        @builtin(position) pos: vec4f,
      }

      @fragment fn imageFragment_3(_arg_0: imageFragment_Input_8) -> @location(0) vec4f {
        var luminance = textureLoad(iChannel0_4, vec2i(_arg_0.pos.xy), 0).xyz;
        if ((luminancePostprocessing_5 == 1u)) {
          luminance = (luminance * 2);
          luminance = tonemapACES_6(luminance);
          luminance = gammaSRGB_7(luminance);
        }
        return vec4f(luminance, 1f);
      }"
    `);
  });
});
