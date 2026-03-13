/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockMathRandom, mockResizeObserver } from '../utils/commonMocks.ts';

describe('volumetric radiance cascades example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'volumetric-radiance-cascades',
      expectedCalls: 3,
      setupMocks: () => {
        mockResizeObserver();
        mockMathRandom();
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

      @group(0) @binding(0) var<uniform> workResolutionUniform_4: vec3f;

      fn coordToWorldPos_5(coord: vec2f, resolution: vec2f) -> vec2f {
        var center = (resolution * 0.5);
        var relative = (coord - center);
        return (relative / (min(resolution.x, resolution.y) / 2f));
      }

      fn sdDisk_9(p: vec2f, radius: f32) -> f32 {
        return (length(p) - radius);
      }

      fn circle_8(color: vec4f, position: vec2f, radius: f32, albedo: vec4f) -> vec4f {
        let sanitizedRadius = max(1e-3f, radius);
        var result = color;
        if ((sdDisk_9(position, sanitizedRadius) < 0f)) {
          result = albedo;
        }
        return result;
      }

      fn shadertoyScene_7(worldPos: vec2f, time: f32) -> vec4f {
        var color = vec4f();
        color = circle_8(color, (vec2f(-0.699999988079071, 0) - worldPos), ((((sin(time) * 0.5f) + 0.5f) / 8f) + 0.01f), vec4f(1, 0.5, 0, 1));
        color = circle_8(color, (vec2f(0f, (sin(time) * 0.5f)) - worldPos), 0.125f, vec4f(0, 0, 0, 0.009999999776482582));
        color = circle_8(color, (vec2f(0.699999988079071, 0) - worldPos), ((((-(sin(time)) * 0.5f) + 0.5f) / 8f) + 0.01f), vec4f(1));
        return color;
      }

      fn dot2_13(v: vec2f) -> f32 {
        return dot(v, v);
      }

      fn sdHeart_12(position: vec2f) -> f32 {
        var p = position.xy;
        p.x = abs(p.x);
        if (((p.y + p.x) > 1f)) {
          return (sqrt(dot2_13((p - vec2f(0.25, 0.75)))) - 0.3535533905932738f);
        }
        return (sqrt(min(dot2_13((p - vec2f(0, 1))), dot2_13((p - (0.5f * max((p.x + p.y), 0f)))))) * sign((p.x - p.y)));
      }

      fn heart_11(color: vec4f, position: vec2f, radius: f32, albedo: vec4f) -> vec4f {
        let distance = sdHeart_12((position / radius));
        var result = color;
        if ((distance < 0f)) {
          result = albedo;
        }
        return result;
      }

      fn heartsScene_10(worldPos: vec2f, time: f32) -> vec4f {
        const angle = 0.8975979010256552;
        var colors = array<vec4f, 7>(vec4f(1, 0, 0, 1), vec4f(1, 0.6899999976158142, 0, 1), vec4f(0.9700000286102295, 1, 0, 1), vec4f(0, 1, 0.10999999940395355, 1), vec4f(0, 1, 1, 1), vec4f(0.25999999046325684, 0, 1, 1), vec4f(0.9900000095367432, 0, 1, 1));
        var color = vec4f();
        for (var i = 0u; (i < 7u); i++) {
          var position = (vec2f(sin((time + (angle * f32(i)))), (cos((time + (angle * f32(i)))) + 0.3f)) * 0.7);
          color = heart_11(color, (position - worldPos), 0.3f, colors[i]);
        }
        return color;
      }

      struct Dot_16 {
        position: vec2f,
        radius: f32,
        albedo: vec4f,
      }

      const dots_15: array<Dot_16, 64> = array<Dot_16, 64>(Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)), Dot_16(vec2f(), 0.025f, vec4f(0, 0, 0, 1)));

      fn dotsScene_14(worldPos: vec2f, time: f32) -> vec4f {
        var color = vec4f();
        for (var i = 0u; (i < 64u); i++) {
          let offsetAngle = (f32(i) + (((time * sign((f32((i % 2u)) - 0.5f))) * f32((i + 100u))) / 200f));
          var offset = (vec2f(sin(offsetAngle), cos(offsetAngle)) * 0.1);
          color = circle_8(color, ((dots_15[i].position + offset) - worldPos), dots_15[i].radius, dots_15[i].albedo);
        }
        return color;
      }

      fn getSceneColor_6(worldPos: vec2f, time: f32, selectedScene: u32) -> vec4f {
        if ((selectedScene == 0u)) {
          return shadertoyScene_7(worldPos, time);
        }
        if ((selectedScene == 1u)) {
          return heartsScene_10(worldPos, time);
        }
        if ((selectedScene == 2u)) {
          return dotsScene_14(worldPos, time);
        }
        return vec4f(0, 0, 0, 1);
      }

      @group(0) @binding(1) var<uniform> timeUniform_17: f32;

      @group(0) @binding(2) var<uniform> selectedSceneUniform_18: u32;

      struct prerenderSceneFragment_Input_19 {
        @builtin(position) pos: vec4f,
      }

      @fragment fn prerenderSceneFragment_3(_arg_0: prerenderSceneFragment_Input_19) -> @location(0) vec4f {
        var worldPos = coordToWorldPos_5(_arg_0.pos.xy, workResolutionUniform_4.xy);
        return getSceneColor_6(worldPos, timeUniform_17, selectedSceneUniform_18);
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

      @group(0) @binding(0) var<uniform> workResolutionUniform_4: vec3f;

      fn getIntervalScale_7(cascadeIndex: i32) -> f32 {
        if ((cascadeIndex <= 0i)) {
          return 0;
        }
        return f32((1u << u32((2i * cascadeIndex))));
      }

      fn getIntervalRange_6(cascadeIndex: i32) -> vec2f {
        return (vec2f(getIntervalScale_7(cascadeIndex), getIntervalScale_7((cascadeIndex + 1i))) * 0.3);
      }

      fn castInterval_8(scene: texture_2d<f32>, intervalStart: vec2f, intervalEnd: vec2f, cascadeIndex: i32) -> vec4f {
        var dir = (intervalEnd - intervalStart);
        let steps = (16u << u32(cascadeIndex));
        var stepSize = (dir / f32(steps));
        var radiance = vec3f();
        var transmittance = 1f;
        for (var i = 0u; (i < steps); i++) {
          var coord = (intervalStart + (stepSize * f32(i)));
          var sceneColor = textureLoad(scene, vec2i(coord), 0);
          radiance = (radiance + ((sceneColor.xyz * transmittance) * sceneColor.w));
          transmittance *= (1f - sceneColor.w);
        }
        return vec4f(radiance, transmittance);
      }

      fn getBilinearWeights_9(ratio: vec2f) -> vec4f {
        return vec4f(((1f - ratio.x) * (1f - ratio.y)), (ratio.x * (1f - ratio.y)), ((1f - ratio.x) * ratio.y), (ratio.x * ratio.y));
      }

      fn getBilinearOffset_10(offsetIndex: u32) -> vec2i {
        var offsets = array<vec2i, 4>(vec2i(), vec2i(1, 0), vec2i(0, 1), vec2i(1));
        return offsets[offsetIndex];
      }

      fn mergeIntervals_11(near: vec4f, far: vec4f) -> vec4f {
        var radiance = (near.xyz + (far.xyz * near.w));
        return vec4f(radiance, (near.w * far.w));
      }

      fn castAndMerge_5(scene: texture_2d<f32>, texture: texture_2d<f32>, cascadeIndex: i32, fragCoord: vec2f, resolution: vec2f, bilinearFix: u32, cascadesNumber: i32) -> vec4f {
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
        var destInterval = castInterval_8(scene, intervalStart, intervalEnd, cascadeIndex);
        if ((cascadeIndex == (cascadesNumber - 1i))) {
          return destInterval;
        }
        let bilinearProbeSize = i32((1u << u32((cascadeIndex + 1i))));
        var bilinearBaseCoord = ((probePosition / f32(bilinearProbeSize)) - 0.5);
        var ratio = fract(bilinearBaseCoord);
        var weights = getBilinearWeights_9(ratio);
        var baseIndex = vec2i(floor(bilinearBaseCoord));
        for (var b = 0u; (b < 4u); b++) {
          var baseOffset = getBilinearOffset_10(b);
          var bilinearIndex = clamp((baseIndex + baseOffset), vec2i(), ((vec2i(resolution) / bilinearProbeSize) - 1));
          var bilinearPosition = ((vec2f(bilinearIndex) + 0.5) * f32(bilinearProbeSize));
          if ((bilinearFix == 1u)) {
            var intervalRange2 = getIntervalRange_6(cascadeIndex);
            var intervalStart2 = (probePosition + (dir * intervalRange2.x));
            var intervalEnd2 = (bilinearPosition + (dir * intervalRange2.y));
            destInterval = castInterval_8(scene, intervalStart2, intervalEnd2, cascadeIndex);
          }
          var bilinearRadiance = vec4f();
          for (var dd = 0; (dd < 4i); dd++) {
            let baseDirIndex = (dirIndex * 4i);
            let bilinearDirIndex = (baseDirIndex + dd);
            var bilinearDirCoord = vec2i((bilinearDirIndex % bilinearProbeSize), i32((f32(bilinearDirIndex) / f32(bilinearProbeSize))));
            var bilinearTexel = ((bilinearIndex * bilinearProbeSize) + bilinearDirCoord);
            var bilinearInterval = textureLoad(texture, bilinearTexel, 0);
            bilinearRadiance = (bilinearRadiance + (mergeIntervals_11(destInterval, bilinearInterval) * weights[b]));
          }
          radiance = (radiance + (bilinearRadiance * 0.25));
        }
        return radiance;
      }

      @group(1) @binding(0) var scene_12: texture_2d<f32>;

      @group(1) @binding(1) var iChannel0_13: texture_2d<f32>;

      @group(0) @binding(1) var<uniform> cascadeIndexUniform_14: i32;

      @group(0) @binding(2) var<uniform> bilinearFixUniform_15: u32;

      @group(0) @binding(3) var<uniform> cascadesNumberUniform_16: i32;

      struct castAndMergeFragment_Input_17 {
        @builtin(position) pos: vec4f,
      }

      @fragment fn castAndMergeFragment_3(_arg_0: castAndMergeFragment_Input_17) -> @location(0) vec4f {
        return castAndMerge_5(scene_12, iChannel0_13, cascadeIndexUniform_14, _arg_0.pos.xy, workResolutionUniform_4.xy, bilinearFixUniform_15, cascadesNumberUniform_16);
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

      @group(0) @binding(0) var sampler_5: sampler;

      @group(0) @binding(1) var<uniform> luminancePostprocessingUniform_6: u32;

      fn tonemapACES_7(colorArg: vec3f) -> vec3f {
        var color = colorArg.xyz;
        var acesInputMat = mat3x3f(0.5971900224685669, 0.07599999755620956, 0.0284000001847744, 0.35457998514175415, 0.9083399772644043, 0.1338299959897995, 0.04822999984025955, 0.01565999910235405, 0.8377699851989746);
        var acesOutputMat = mat3x3f(1.6047500371932983, -0.10208000242710114, -0.003269999986514449, -0.5310800075531006, 1.1081299781799316, -0.07276000082492828, -0.07366999983787537, -0.006049999967217445, 1.0760200023651123);
        color = (acesInputMat * color);
        var a = ((color * (color + 0.0245786)) - 9.0537e-5);
        var b = ((color * ((color * 0.983729) + 0.432951)) + 0.238081);
        color = (a / b);
        color = (acesOutputMat * color);
        return clamp(color, vec3f(), vec3f(1));
      }

      fn gammaSRGB_8(linearSRGB: vec3f) -> vec3f {
        var a = (linearSRGB * 12.92);
        var b = ((pow(linearSRGB, vec3f(0.4166666567325592)) * 1.055) - 0.055);
        var c = step(vec3f(0.0031308000907301903), linearSRGB);
        return mix(a, b, c);
      }

      struct imageFragment_Input_9 {
        @location(0) uv: vec2f,
      }

      @fragment fn imageFragment_3(_arg_0: imageFragment_Input_9) -> @location(0) vec4f {
        var luminance = textureSample(iChannel0_4, sampler_5, _arg_0.uv).xyz;
        if ((luminancePostprocessingUniform_6 == 1u)) {
          luminance = (luminance * 2);
          luminance = tonemapACES_7(luminance);
          luminance = gammaSRGB_8(luminance);
        }
        return vec4f(luminance, 1f);
      }"
    `);
  });
});
