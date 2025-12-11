/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('clouds example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'clouds',
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

      var<private> seed_6: vec2f;

      fn seed2_5(value: vec2f) {
        seed_6 = value;
      }

      fn randSeed2_4(seed: vec2f) {
        seed2_5(seed);
      }

      @group(0) @binding(0) var<uniform> resolution_7: vec2f;

      fn item_10() -> f32 {
        let a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168f));
        seed_6.y = fract((cos(b) * 534.7645f));
        return seed_6.y;
      }

      fn randFloat01_9() -> f32 {
        return item_10();
      }

      @group(1) @binding(0) var<uniform> time_13: f32;

      @group(1) @binding(1) var noiseTexture_16: texture_2d<f32>;

      @group(1) @binding(2) var sampler_17: sampler;

      fn noise3d_14(pos: vec3f) -> f32 {
        var idx = floor(pos);
        var frac = fract(pos);
        var smooth_15 = ((frac * frac) * (3 - (2 * frac)));
        var texCoord0 = fract((((idx.xy + frac.xy) + (vec2f(37, 239) * idx.z)) / 256));
        var texCoord1 = fract((((idx.xy + frac.xy) + (vec2f(37, 239) * (idx.z + 1f))) / 256));
        let val0 = textureSampleLevel(noiseTexture_16, sampler_17, texCoord0, 0).x;
        let val1 = textureSampleLevel(noiseTexture_16, sampler_17, texCoord1, 0).x;
        return ((mix(val0, val1, smooth_15.z) * 2f) - 1f);
      }

      fn fbm_12(pos: vec3f) -> f32 {
        var wind = vec3f((sin(time_13) / 2f), (cos(time_13) / 2f), (time_13 * 2f));
        var windPos = (pos + wind);
        var sum = 0f;
        var amp = 1f;
        var freq = 1.399999976158142f;
        for (var i = 0; (i < 3i); i++) {
          sum += (noise3d_14((windPos * freq)) * amp);
          amp *= 0.5f;
          freq *= 2f;
        }
        return sum;
      }

      fn sampleDensity_11(pos: vec3f) -> f32 {
        return saturate(((fbm_12(pos) + 0.45f) - 0.5f));
      }

      fn sampleDensityCheap_18(pos: vec3f) -> f32 {
        var wind = vec3f(sin(time_13), cos(time_13), (time_13 * 2f));
        var windPos = (pos + wind);
        let noise = (noise3d_14((windPos * 1.4)) * 1f);
        return clamp(((noise + 0.45f) - 0.5f), 0f, 1f);
      }

      fn raymarch_8(rayOrigin: vec3f, rayDir: vec3f, sunDir: vec3f) -> vec4f {
        var accum = vec4f();
        const stepSize = 0.025;
        var dist = (randFloat01_9() * stepSize);
        for (var i = 0; (i < 40i); i++) {
          var samplePos = (rayOrigin + (rayDir * (dist * 6f)));
          let cloudDensity = sampleDensity_11(samplePos);
          if ((cloudDensity > 0f)) {
            var shadowPos = (samplePos + sunDir);
            let shadowDensity = sampleDensityCheap_18(shadowPos);
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

      struct mainFragment_Input_19 {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment_3(_arg_0: mainFragment_Input_19) -> @location(0) vec4f {
        randSeed2_4(_arg_0.uv);
        let screenRes = (&resolution_7);
        let aspect = ((*screenRes).x / (*screenRes).y);
        var screenPos = ((_arg_0.uv - 0.5) * 2);
        screenPos = vec2f((screenPos.x * max(aspect, 1f)), (screenPos.y * max((1f / aspect), 1f)));
        var sunDir = vec3f(1, 0, 0);
        var rayOrigin = vec3f(0, 0, -3);
        var rayDir = normalize(vec3f(screenPos.x, screenPos.y, 1f));
        let sunDot = clamp(dot(rayDir, sunDir), 0f, 1f);
        let sunGlow = pow(sunDot, 1.371742112482853f);
        var skyCol = (vec3f(0.75, 0.6600000262260437, 0.8999999761581421) - (vec3f(1, 0.699999988079071, 0.4300000071525574) * (rayDir.y * 0.35f)));
        skyCol = (skyCol + (vec3f(1, 0.3700000047683716, 0.17000000178813934) * sunGlow));
        var cloudCol = raymarch_8(rayOrigin, rayDir, sunDir);
        var finalCol = ((skyCol * (1.1f - cloudCol.w)) + cloudCol.xyz);
        return vec4f(finalCol, 1f);
      }"
    `);
  });
});
