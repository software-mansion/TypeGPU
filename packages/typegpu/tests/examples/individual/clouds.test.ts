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

      struct CloudsParams {
        time: f32,
        maxSteps: i32,
        maxDistance: f32,
      }

      @group(1) @binding(0) var<uniform> params: CloudsParams;

      var<private> seed: vec2f;

      fn seed2(value: vec2f) {
        seed = value;
      }

      fn randSeed2(seed: vec2f) {
        seed2(seed);
      }

      @group(0) @binding(0) var<uniform> resolutionUniform: vec2f;

      fn sample() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randFloat01() -> f32 {
        return sample();
      }

      @group(1) @binding(1) var noiseTexture: texture_2d<f32>;

      @group(1) @binding(2) var sampler_1: sampler;

      fn noise3d(pos: vec3f) -> f32 {
        var idx = floor(pos);
        var frac = fract(pos);
        var smooth_1 = ((frac * frac) * (3f - (2f * frac)));
        var texCoord0 = fract((((idx.xy + frac.xy) + (vec2f(37, 239) * idx.z)) / 256f));
        var texCoord1 = fract((((idx.xy + frac.xy) + (vec2f(37, 239) * (idx.z + 1f))) / 256f));
        let val0 = textureSampleLevel(noiseTexture, sampler_1, texCoord0, 0).x;
        let val1 = textureSampleLevel(noiseTexture, sampler_1, texCoord1, 0).x;
        return ((mix(val0, val1, smooth_1.z) * 2f) - 1f);
      }

      fn fbm(pos: vec3f) -> f32 {
        var sum = 0f;
        var amp = 1f;
        var freq = 1.399999976158142f;
        // unrolled iteration #0, 'i' is '0'
        {
          sum += (noise3d((pos * freq)) * amp);
          amp *= 0.5f;
          freq *= 2f;
        }
        // unrolled iteration #1, 'i' is '1'
        {
          sum += (noise3d((pos * freq)) * amp);
          amp *= 0.5f;
          freq *= 2f;
        }
        // unrolled iteration #2, 'i' is '2'
        {
          sum += (noise3d((pos * freq)) * amp);
          amp *= 0.5f;
          freq *= 2f;
        }
        return sum;
      }

      fn sampleDensity(pos: vec3f) -> f32 {
        let coverage = (0.7f - (abs(pos.y) * 0.25f));
        return (saturate((fbm(pos) + coverage)) - 0.5f);
      }

      fn sampleDensityCheap(pos: vec3f) -> f32 {
        let noise = (noise3d((pos * 1.4f)) * 1f);
        return clamp(((noise + 0.7f) - 0.5f), 0f, 1f);
      }

      fn raymarch(rayOrigin: vec3f, rayDir: vec3f, sunDir: vec3f) -> vec4f {
        var accum = vec4f();
        let params_1 = (&params);
        let maxSteps = (*params_1).maxSteps;
        let maxDepth = (*params_1).maxDistance;
        let stepSize = (1f / f32(maxSteps));
        var dist = (randFloat01() * stepSize);
        for (var i = 0; (i < maxSteps); i++) {
          var samplePos = (rayOrigin + (rayDir * (dist * maxDepth)));
          let cloudDensity = sampleDensity(samplePos);
          if ((cloudDensity > 0f)) {
            var shadowPos = (samplePos + sunDir);
            let shadowDensity = sampleDensityCheap(shadowPos);
            let shadow = clamp((cloudDensity - shadowDensity), 0f, 1f);
            let lightVal = mix(0.3f, 1f, shadow);
            var light = (vec3f(0.6600000262260437, 0.4949999749660492, 0.824999988079071) + (vec3f(1, 0.699999988079071, 0.30000001192092896) * (lightVal * 0.9f)));
            var color = mix(vec3f(1), vec3f(0.20000000298023224), cloudDensity);
            var lit = (color * light);
            var contrib = (vec4f(lit, 1f) * (cloudDensity * (0.88f - accum.a)));
            accum = (accum + contrib);
            if ((accum.a >= 0.879f)) {
              break;
            }
          }
          dist += stepSize;
        }
        return accum;
      }

      struct mainFragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment(_arg_0: mainFragment_Input) -> @location(0) vec4f {
        randSeed2((_arg_0.uv * params.time));
        let screenRes = (&resolutionUniform);
        let aspect = ((*screenRes).x / (*screenRes).y);
        var screenPos = ((_arg_0.uv - 0.5f) * 2f);
        screenPos = vec2f((screenPos.x * max(aspect, 1f)), (screenPos.y * max((1f / aspect), 1f)));
        var sunDir = vec3f(1, 0, 0);
        let time = params.time;
        var rayOrigin = vec3f((sin((time * 0.6f)) * 0.5f), ((cos((time * 0.8f)) * 0.5f) - 1f), (time * 1f));
        var rayDir = normalize(vec3f(screenPos.x, screenPos.y, 1f));
        let sunDot = clamp(dot(rayDir, sunDir), 0f, 1f);
        let sunGlow = pow(sunDot, 1.371742112482853f);
        var skyCol = (vec3f(0.75, 0.6600000262260437, 0.8999999761581421) - (vec3f(1, 0.699999988079071, 0.4300000071525574) * (rayDir.y * 0.35f)));
        skyCol = (skyCol + (vec3f(1, 0.3700000047683716, 0.17000000178813934) * sunGlow));
        var cloudCol = raymarch(rayOrigin, rayDir, sunDir);
        var finalCol = ((skyCol * (1.1f - cloudCol.a)) + cloudCol.rgb);
        return vec4f(finalCol, 1f);
      }"
    `);
  });
});
