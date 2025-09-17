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
      "struct mainVertex_Input_1 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct mainVertex_Output_2 {
        @builtin(position) outPos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn mainVertex_0(_arg_0: mainVertex_Input_1) -> mainVertex_Output_2 {
        var pos = array<vec2f, 6>(vec2f(-1, 1), vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(1, -1), vec2f(1));
        var uv = array<vec2f, 6>(vec2f(0, 1), vec2f(), vec2f(1, 0), vec2f(0, 1), vec2f(1, 0), vec2f(1));
        return mainVertex_Output_2(vec4f(pos[_arg_0.vertexIndex], 0, 1), uv[_arg_0.vertexIndex]);
      }

      struct mainFragment_Input_4 {
        @location(0) uv: vec2f,
      }

      @group(0) @binding(0) var<uniform> resolutionUniform_6: vec2f;

      fn aspectCorrected_5(uv: vec2f) -> vec2f {
        var v = ((uv.xy - 0.5) * 2);
        var aspect = (resolutionUniform_6.x / resolutionUniform_6.y);
        if ((aspect > 1)) {
          v.x *= aspect;
        }
        else {
          v.y /= aspect;
        }
        return v;
      }

      @group(0) @binding(1) var<uniform> time_7: f32;

      fn palette_8(t: f32) -> vec3f {
        var a = vec3f(0.5, 0.5899999737739563, 0.8500000238418579);
        var b = vec3f(0.18000000715255737, 0.41999998688697815, 0.4000000059604645);
        var c = vec3f(0.18000000715255737, 0.47999998927116394, 0.4099999964237213);
        var e = vec3f(0.3499999940395355, 0.12999999523162842, 0.3199999928474426);
        var expr = cos((6.28318 * ((c * t) + e)));
        return (a + (b * expr));
      }

      fn accumulate_9(acc: vec3f, col: vec3f, weight: f32) -> vec3f {
        return (acc + (col * weight));
      }

      @fragment fn mainFragment_3(_arg_0: mainFragment_Input_4) -> @location(0) vec4f {
      {
          var aspectUv = aspectCorrected_5(_arg_0.uv);
          var originalUv = aspectUv;
          var accumulatedColor = vec3f();
          for (var iteration = 0; (iteration < 5); iteration++) {
            aspectUv = (fract((aspectUv * (1.3 * sin(time_7)))) - 0.5);
            var radialLength = (length(aspectUv) * exp((-length(originalUv) * 2)));
            var paletteColor = palette_8((length(originalUv) + (time_7 * 0.9)));
            radialLength = (sin(((radialLength * 8) + time_7)) / 8f);
            radialLength = abs(radialLength);
            radialLength = smoothstep(0, 0.1, radialLength);
            radialLength = (0.06f / radialLength);
            accumulatedColor = accumulate_9(accumulatedColor, paletteColor, radialLength);
          }
          return vec4f(accumulatedColor, 1);
        }
      }"
    `);
  });
});
