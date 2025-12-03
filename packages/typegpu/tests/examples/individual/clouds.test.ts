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
      "struct mainVertex_Output_1 {
        @builtin(position) outPos: vec4f,
        @location(0) uv: vec2f,
      }

      struct mainVertex_Input_2 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertex_0(input: mainVertex_Input_2) -> mainVertex_Output_1 {
        var pos = array<vec2f, 6>(vec2f(-1, 1), vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(1, -1), vec2f(1));
        var uv = array<vec2f, 6>(vec2f(0, 1), vec2f(), vec2f(1, 0), vec2f(0, 1), vec2f(1, 0), vec2f(1));
        return mainVertex_Output_1(vec4f(pos[input.vertexIndex], 0, 1), uv[input.vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> resolutionUniform_5: vec2f;

      @group(0) @binding(1) var<uniform> time_8: f32;

      @group(0) @binding(2) var item_10: texture_2d<f32>;

      @group(0) @binding(3) var sampler_11: sampler;

      fn noise_9(x: vec3f) -> f32 {
        var p = floor(x);
        var f = fract(x);
        f = ((f * f) * (3 - (2 * f)));
        var uv = ((p.xy + (vec2f(37, 239) * vec2f(p.z, p.z))) + f.xy);
        var tex = textureSampleLevel(item_10, sampler_11, fract(((uv + vec2f(0.5)) / 256)), 0).yx;
        return ((mix(tex.x, tex.y, f.z) * 2) - 1);
      }

      fn fractalBrownianMotion_7(p: vec3f) -> f32 {
        var q = (p + vec3f(sin(time_8), cos(time_8), (time_8 * 3)));
        var sum = 0f;
        var amplitude = 1f;
        var frequency = 2.2300000190734863f;
        for (var i = 0; (i < 4); i++) {
          sum += (noise_9(q) * amplitude);
          q = (q * frequency);
          amplitude *= 0.4;
          frequency += 0.5;
        }
        return sum;
      }

      fn raymarch_6(ro: vec3f, rd: vec3f, sunDirection: vec3f) -> vec4f {
        var res = vec4f();
        var hash = fract((sin(dot(rd.xy, vec2f(12.989800453186035, 78.23300170898438))) * 43758.5453));
        var depth = (hash * 0.05);
        for (var i = 0; (i < 120); i++) {
          var p = (ro + (rd * depth));
          var rawDensity = ((fractalBrownianMotion_7(p) - 1.5) + 1.2);
          var density = clamp(rawDensity, 0, 1);
          if ((density > 0)) {
            var diffuse = clamp((((rawDensity - fractalBrownianMotion_7((p + sunDirection))) - 1.5) + 1.2), 0, 1);
            diffuse = mix(0.3, 1, diffuse);
            var lighting = (vec3f(0.6600000262260437, 0.4949999749660492, 0.824999988079071) + (vec3f(1, 0.699999988079071, 0.30000001192092896) * (diffuse * 0.7)));
            var albedo = mix(vec3f(1), vec3f(0.20000000298023224), density);
            var lit = (albedo * lighting);
            var premul = (vec4f(lit, 1) * density);
            res = (res + (premul * (0.88 - res.w)));
            if ((res.w >= 0.879)) {
              break;
            }
          }
          depth += 0.05;
        }
        return res;
      }

      struct mainFragment_Input_12 {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment_3(_arg_0: mainFragment_Input_12) -> @location(0) vec4f {
      {
          var new_uv_4 = ((_arg_0.uv - 0.5) * 2);
          var resVec = resolutionUniform_5;
          var aspect = (resVec.x / resVec.y);
          var scaleX = max(aspect, 1);
          var scaleY = max(1, (1f / aspect));
          new_uv_4 = vec2f((new_uv_4.x * scaleX), (new_uv_4.y * scaleY));
          var sunDirection = vec3f(1, 0, 0);
          var rayOrigin = vec3f(0, 0, -3);
          var rayDirection = normalize(vec3f(new_uv_4.x, new_uv_4.y, 1));
          var sun = clamp(dot(rayDirection, sunDirection), 0, 1);
          var color = vec3f(0.75, 0.6600000262260437, 0.8999999761581421);
          color = (color - ((0.35 * rayDirection.y) * vec3f(1, 0.699999988079071, 0.4300000071525574)));
          color = (color + (vec3f(1, 0.3700000047683716, 0.17000000178813934) * pow(sun, 2.9154518950437325)));
          var marchRes = raymarch_6(rayOrigin, rayDirection, sunDirection);
          color = ((color * (1.1 - marchRes.w)) + marchRes.xyz);
          return vec4f(color, 1);
        }
      }"
    `);
  });
});
