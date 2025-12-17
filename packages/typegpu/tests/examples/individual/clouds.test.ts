/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockResizeObserver } from '../utils/commonMocks.ts';

describe('clouds example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'clouds',
      expectedCalls: 1,
      setupMocks: mockResizeObserver,
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

      struct CloudsParams_5 {
        time: f32,
        maxSteps: i32,
        maxDistance: f32,
      }

      @group(1) @binding(0) var<uniform> params_4: CloudsParams_5;

      var<private> seed_8: vec2f;

      fn seed2_7(value: vec2f) {
        seed_8 = value;
      }

      fn randSeed2_6(seed: vec2f) {
        seed2_7(seed);
      }

      @group(0) @binding(0) var<uniform> resolutionUniform_9: vec2f;

      fn item_12() -> f32 {
        let a = dot(seed_8, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed_8, vec2f(54.47856521606445, 345.8415222167969));
        seed_8.x = fract((cos(a) * 136.8168f));
        seed_8.y = fract((cos(b) * 534.7645f));
        return seed_8.y;
      }

      fn randFloat01_11() -> f32 {
        return item_12();
      }

      @group(1) @binding(1) var noiseTexture_17: texture_2d<f32>;

      @group(1) @binding(2) var sampler_18: sampler;

      fn noise3d_15(pos: vec3f) -> f32 {
        var idx = floor(pos);
        var frac = fract(pos);
        var smooth_16 = ((frac * frac) * (3 - (2 * frac)));
        var texCoord0 = fract((((idx.xy + frac.xy) + (vec2f(37, 239) * idx.z)) / 256));
        var texCoord1 = fract((((idx.xy + frac.xy) + (vec2f(37, 239) * (idx.z + 1f))) / 256));
        let val0 = textureSampleLevel(noiseTexture_17, sampler_18, texCoord0, 0).x;
        let val1 = textureSampleLevel(noiseTexture_17, sampler_18, texCoord1, 0).x;
        return ((mix(val0, val1, smooth_16.z) * 2f) - 1f);
      }

      fn fbm_14(pos: vec3f) -> f32 {
        var sum = 0f;
        var amp = 1f;
        var freq = 1.399999976158142f;
        for (var i = 0; (i < 3i); i++) {
          sum += (noise3d_15((pos * freq)) * amp);
          amp *= 0.5f;
          freq *= 2f;
        }
        return sum;
      }

      fn sampleDensity_13(pos: vec3f) -> f32 {
        let coverage = (0.7f - (abs(pos.y) * 0.25f));
        return (saturate((fbm_14(pos) + coverage)) - 0.5f);
      }

      fn sampleDensityCheap_19(pos: vec3f) -> f32 {
        let noise = (noise3d_15((pos * 1.4)) * 1f);
        return clamp(((noise + 0.7f) - 0.5f), 0f, 1f);
      }

      fn raymarch_10(rayOrigin: vec3f, rayDir: vec3f, sunDir: vec3f) -> vec4f {
        var accum = vec4f();
        let params = (&params_4);
        let maxSteps = (*params).maxSteps;
        let maxDepth = (*params).maxDistance;
        let stepSize = (1f / f32(maxSteps));
        var dist = (randFloat01_11() * stepSize);
        for (var i = 0; (i < maxSteps); i++) {
          var samplePos = (rayOrigin + (rayDir * (dist * maxDepth)));
          let cloudDensity = sampleDensity_13(samplePos);
          if ((cloudDensity > 0f)) {
            var shadowPos = (samplePos + sunDir);
            let shadowDensity = sampleDensityCheap_19(shadowPos);
            let shadow = clamp((cloudDensity - shadowDensity), 0f, 1f);
            let lightVal = mix(0.3f, 1f, shadow);
            var light = (vec3f(0.6600000262260437, 0.4949999749660492, 0.824999988079071) + (vec3f(1, 0.699999988079071, 0.30000001192092896) * (lightVal * 0.9f)));
            var color = mix(vec3f(1), vec3f(0.20000000298023224), cloudDensity);
            var lit = (color * light);
            var contrib = (vec4f(lit, 1f) * (cloudDensity * (0.88f - accum.w)));
            accum = (accum + contrib);
            if ((accum.w >= 0.879f)) {
              break;
            }
          }
          dist += stepSize;
        }
        return accum;
      }

      struct mainFragment_Input_20 {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment_3(_arg_0: mainFragment_Input_20) -> @location(0) vec4f {
        randSeed2_6((_arg_0.uv * params_4.time));
        let screenRes = (&resolutionUniform_9);
        let aspect = ((*screenRes).x / (*screenRes).y);
        var screenPos = ((_arg_0.uv - 0.5) * 2);
        screenPos = vec2f((screenPos.x * max(aspect, 1f)), (screenPos.y * max((1f / aspect), 1f)));
        var sunDir = vec3f(1, 0, 0);
        let time = params_4.time;
        var rayOrigin = vec3f((sin((time * 0.6f)) * 0.5f), ((cos((time * 0.8f)) * 0.5f) - 1f), (time * 1f));
        var rayDir = normalize(vec3f(screenPos.x, screenPos.y, 1f));
        let sunDot = clamp(dot(rayDir, sunDir), 0f, 1f);
        let sunGlow = pow(sunDot, 1.371742112482853f);
        var skyCol = (vec3f(0.75, 0.6600000262260437, 0.8999999761581421) - (vec3f(1, 0.699999988079071, 0.4300000071525574) * (rayDir.y * 0.35f)));
        skyCol = (skyCol + (vec3f(1, 0.3700000047683716, 0.17000000178813934) * sunGlow));
        var cloudCol = raymarch_10(rayOrigin, rayDir, sunDir);
        var finalCol = ((skyCol * (1.1f - cloudCol.w)) + cloudCol.xyz);
        return vec4f(finalCol, 1f);
      }"
    `);
  });
});
