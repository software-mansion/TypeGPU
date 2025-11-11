/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('disco example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'disco',
      controlTriggers: ['Test Resolution'],
      expectedCalls: 7,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct mainVertex_Output_1 {
        @builtin(position) outPos: vec4f,
        @location(0) uv: vec2f,
      }

      struct mainVertex_Input_2 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertex_0(_arg_0: mainVertex_Input_2) -> mainVertex_Output_1 {
        var pos = array<vec2f, 6>(vec2f(-1, 1f), vec2f(-1, -1), vec2f(1f, -1), vec2f(-1, 1f), vec2f(1f, -1), vec2f(1));
        var uv = array<vec2f, 6>(vec2f(0, 1), vec2f(), vec2f(1, 0), vec2f(0, 1), vec2f(1, 0), vec2f(1));
        return mainVertex_Output_1(vec4f(pos[_arg_0.vertexIndex], 0f, 1f), uv[_arg_0.vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> resolutionUniform_5: vec2f;

      fn aspectCorrected_4(uv: vec2f) -> vec2f {
        var v = ((uv.xy - 0.5) * 2);
        var aspect = (resolutionUniform_5.x / resolutionUniform_5.y);
        if ((aspect > 1f)) {
          v.x *= aspect;
        }
        else {
          v.y /= aspect;
        }
        return v;
      }

      @group(0) @binding(1) var<uniform> time_6: f32;

      fn palette_7(t: f32) -> vec3f {
        var a = vec3f(0.5, 0.5899999737739563, 0.8500000238418579);
        var b = vec3f(0.18000000715255737, 0.41999998688697815, 0.4000000059604645);
        var c = vec3f(0.18000000715255737, 0.47999998927116394, 0.4099999964237213);
        var e = vec3f(0.3499999940395355, 0.12999999523162842, 0.3199999928474426);
        var expr = cos((6.28318 * ((c * t) + e)));
        return (a + (b * expr));
      }

      fn accumulate_8(acc: vec3f, col: vec3f, weight: f32) -> vec3f {
        return (acc + (col * weight));
      }

      struct mainFragment_Input_9 {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment_3(_arg_0: mainFragment_Input_9) -> @location(0) vec4f {
      {
          var aspectUv = aspectCorrected_4(_arg_0.uv);
          var originalUv = aspectUv;
          var accumulatedColor = vec3f();
          for (var iteration = 0; (iteration < 5i); iteration++) {
            aspectUv = (fract((aspectUv * (1.3f * sin(time_6)))) - 0.5);
            var radialLength = (length(aspectUv) * exp((-length(originalUv) * 2f)));
            var paletteColor = palette_7((length(originalUv) + (time_6 * 0.9f)));
            radialLength = (sin(((radialLength * 8f) + time_6)) / 8f);
            radialLength = abs(radialLength);
            radialLength = smoothstep(0, 0.1, radialLength);
            radialLength = (0.06f / radialLength);
            accumulatedColor = accumulate_8(accumulatedColor, paletteColor, radialLength);
          }
          return vec4f(accumulatedColor, 1f);
        }
      }"
    `);
  });
});
