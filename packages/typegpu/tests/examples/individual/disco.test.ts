/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('disco example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'disco',
        controlTriggers: ['Test Resolution'],
        expectedCalls: 7,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct mainVertex_Output {
        @builtin(position) outPos: vec4f,
        @location(0) uv: vec2f,
      }

      struct mainVertex_Input {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertex(_arg_0: mainVertex_Input) -> mainVertex_Output {
        var pos = array<vec2f, 6>(vec2f(-1, 1), vec2f(-1), vec2f(1, -1), vec2f(-1, 1), vec2f(1, -1), vec2f(1));
        var uv = array<vec2f, 6>(vec2f(0, 1), vec2f(), vec2f(1, 0), vec2f(0, 1), vec2f(1, 0), vec2f(1));
        return mainVertex_Output(vec4f(pos[_arg_0.vertexIndex], 0f, 1f), uv[_arg_0.vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> resolutionUniform: vec2f;

      fn aspectCorrected(uv: vec2f) -> vec2f {
        var v = ((uv - 0.5f) * 2f);
        let aspect = (resolutionUniform.x / resolutionUniform.y);
        if ((aspect > 1f)) {
          v.x *= aspect;
        }
        else {
          v.y /= aspect;
        }
        return v;
      }

      @group(0) @binding(1) var<uniform> time: f32;

      fn palette(t: f32) -> vec3f {
        var a = vec3f(0.5, 0.5899999737739563, 0.8500000238418579);
        var b = vec3f(0.18000000715255737, 0.41999998688697815, 0.4000000059604645);
        var c = vec3f(0.18000000715255737, 0.47999998927116394, 0.4099999964237213);
        var e = vec3f(0.3499999940395355, 0.12999999523162842, 0.3199999928474426);
        var expr = cos((6.28318f * ((c * t) + e)));
        return (a + (b * expr));
      }

      fn accumulate(acc: vec3f, col: vec3f, weight: f32) -> vec3f {
        return (acc + (col * weight));
      }

      struct mainFragment2_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment2(_arg_0: mainFragment2_Input) -> @location(0) vec4f {
        var originalUv = aspectCorrected(_arg_0.uv);
        var aspectUv = originalUv;
        var accumulatedColor = vec3f();
        for (var iteration = 0; (iteration < 3i); iteration++) {
          aspectUv = (fract((aspectUv * -0.9f)) - 0.5f);
          var radialLength = (length(aspectUv) * exp((-(length(originalUv)) * 0.5f)));
          var paletteColor = palette((length(originalUv) + (time * 0.9f)));
          radialLength = (sin(((radialLength * 8f) + time)) / 8f);
          radialLength = abs(radialLength);
          radialLength = smoothstep(0f, 0.1f, radialLength);
          radialLength = (0.1f / radialLength);
          accumulatedColor = accumulate(accumulatedColor, paletteColor, radialLength);
        }
        return vec4f(accumulatedColor, 1f);
      }

      struct mainFragment3_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment3(_arg_0: mainFragment3_Input) -> @location(0) vec4f {
        var originalUv = aspectCorrected(_arg_0.uv);
        var aspectUv = originalUv;
        var accumulatedColor = vec3f();
        let baseAngle = (time * 0.3f);
        let cosBaseAngle = cos(baseAngle);
        let sinBaseAngle = sin(baseAngle);
        for (var iteration = 0; (iteration < 4i); iteration++) {
          let iterationF32 = f32(iteration);
          let rotatedX = ((aspectUv.x * cosBaseAngle) - (aspectUv.y * sinBaseAngle));
          let rotatedY = ((aspectUv.x * sinBaseAngle) + (aspectUv.y * cosBaseAngle));
          aspectUv = vec2f(rotatedX, rotatedY);
          aspectUv = (aspectUv * (1.15f + (iterationF32 * 0.05f)));
          aspectUv = (fract((aspectUv * (1.2f * sin(((time * 0.9f) + (iterationF32 * 0.3f)))))) - 0.5f);
          var radialLength = (length(aspectUv) * exp((-(length(originalUv)) * 1.6f)));
          var paletteColor = palette(((length(originalUv) + (time * 0.8f)) + (iterationF32 * 0.05f)));
          radialLength = (sin(((radialLength * 7f) + (time * 0.9f))) / 8f);
          radialLength = abs(radialLength);
          radialLength = smoothstep(0f, 0.11f, radialLength);
          radialLength = (0.055f / (radialLength + 1e-5f));
          accumulatedColor = accumulate(accumulatedColor, paletteColor, radialLength);
        }
        return vec4f(accumulatedColor, 1f);
      }

      struct mainFragment4_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment4(_arg_0: mainFragment4_Input) -> @location(0) vec4f {
        var aspectUv = aspectCorrected(_arg_0.uv);
        var mirroredUv = ((vec2f(abs((fract((aspectUv.x * 1.2f)) - 0.5f)), abs((fract((aspectUv.y * 1.2f)) - 0.5f))) * 2f) - 1f);
        aspectUv = mirroredUv;
        var originalUv = aspectUv;
        var accumulatedColor = vec3f();
        let time_1 = time;
        for (var iteration = 0; (iteration < 4i); iteration++) {
          let iterationF32 = f32(iteration);
          let angle = ((time_1 * (0.4f + (iterationF32 * 0.1f))) + (iterationF32 * 0.9f));
          let cosAngle = cos(angle);
          let sinAngle = sin(angle);
          let rotatedX = ((aspectUv.x * cosAngle) - (aspectUv.y * sinAngle));
          let rotatedY = ((aspectUv.x * sinAngle) + (aspectUv.y * cosAngle));
          aspectUv = (vec2f(rotatedX, rotatedY) * (1.1f + (iterationF32 * 0.07f)));
          aspectUv = (fract((aspectUv * (1.25f + (iterationF32 * 0.15f)))) - 0.5f);
          var radialLength = (length(aspectUv) * exp((-(length(originalUv)) * (1.3f + (iterationF32 * 0.06f)))));
          radialLength = (sin(((radialLength * (7.2f + (iterationF32 * 0.8f))) + (time_1 * (1.1f + (iterationF32 * 0.2f))))) / 8f);
          radialLength = abs(radialLength);
          radialLength = smoothstep(0f, 0.105f, radialLength);
          radialLength = ((0.058f + (iterationF32 * 6e-3f)) / (radialLength + 1e-5f));
          var paletteColor = palette(((length(originalUv) + (time_1 * 0.65f)) + (iterationF32 * 0.045f)));
          accumulatedColor = accumulate(accumulatedColor, paletteColor, radialLength);
        }
        return vec4f(accumulatedColor, 1f);
      }

      struct mainFragment5_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment5(_arg_0: mainFragment5_Input) -> @location(0) vec4f {
        var originalUv = aspectCorrected(_arg_0.uv);
        var aspectUv = originalUv;
        var accumulatedColor = vec3f();
        for (var iteration = 0; (iteration < 3i); iteration++) {
          let iterationF32 = f32(iteration);
          let radius = (length(aspectUv) + 1e-4f);
          let angle = ((radius * (8f + (iterationF32 * 2f))) - (time * (1.5f + (iterationF32 * 0.2f))));
          let cosAngle = cos(angle);
          let sinAngle = sin(angle);
          let rotatedX = ((aspectUv.x * cosAngle) - (aspectUv.y * sinAngle));
          let rotatedY = ((aspectUv.x * sinAngle) + (aspectUv.y * cosAngle));
          aspectUv = (vec2f(rotatedX, rotatedY) * (-0.85f - (iterationF32 * 0.07f)));
          aspectUv = (fract(aspectUv) - 0.5f);
          var radialLength = (length(aspectUv) * exp((-(length(originalUv)) * (0.4f + (iterationF32 * 0.1f)))));
          var paletteColor = palette(((length(originalUv) + (time * 0.9f)) + (iterationF32 * 0.08f)));
          radialLength = (sin(((radialLength * (6f + iterationF32)) + time)) / 8f);
          radialLength = abs(radialLength);
          radialLength = smoothstep(0f, 0.1f, radialLength);
          radialLength = ((0.085f + (iterationF32 * 5e-3f)) / (radialLength + 1e-5f));
          accumulatedColor = accumulate(accumulatedColor, paletteColor, radialLength);
        }
        return vec4f(accumulatedColor, 1f);
      }

      struct mainFragment6_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment6(_arg_0: mainFragment6_Input) -> @location(0) vec4f {
        var aspectUv = aspectCorrected(_arg_0.uv);
        var originalUv = aspectUv;
        var accumulatedColor = vec3f();
        let time_1 = time;
        for (var iteration = 0; (iteration < 5i); iteration++) {
          let iterationF32 = f32(iteration);
          let angle = ((time_1 * (0.25f + (iterationF32 * 0.05f))) + (iterationF32 * 0.6f));
          let cosAngle = cos(angle);
          let sinAngle = sin(angle);
          let rotatedX = ((aspectUv.x * cosAngle) - (aspectUv.y * sinAngle));
          let rotatedY = ((aspectUv.x * sinAngle) + (aspectUv.y * cosAngle));
          aspectUv = (vec2f(rotatedX, rotatedY) * (1.08f + (iterationF32 * 0.04f)));
          var warpedUv = (fract((aspectUv * (1.3f + (iterationF32 * 0.2f)))) - 0.5f);
          var radialLength = (length(warpedUv) * exp((-(length(originalUv)) * (1.4f + (iterationF32 * 0.05f)))));
          radialLength = (sin(((radialLength * (7f + (iterationF32 * 0.7f))) + (time_1 * (0.9f + (iterationF32 * 0.15f))))) / 8f);
          radialLength = abs(radialLength);
          radialLength = smoothstep(0f, 0.1f, radialLength);
          radialLength = ((0.05f + (iterationF32 * 5e-3f)) / (radialLength + 1e-5f));
          var paletteColor = palette(((length(originalUv) + (time_1 * 0.7f)) + (iterationF32 * 0.04f)));
          accumulatedColor = accumulate(accumulatedColor, paletteColor, radialLength);
        }
        return vec4f(accumulatedColor, 1f);
      }

      struct mainFragment7_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment7(_arg_0: mainFragment7_Input) -> @location(0) vec4f {
        var aspectUv = aspectCorrected(_arg_0.uv);
        aspectUv = (vec2f(abs((fract((aspectUv.x * 1.5f)) - 0.5f)), abs((fract((aspectUv.y * 1.5f)) - 0.5f))) * 2f);
        var originalUv = aspectUv;
        var accumulatedColor = vec3f();
        let time_1 = time;
        for (var iteration = 0; (iteration < 4i); iteration++) {
          let iterationF32 = f32(iteration);
          let angle = ((iterationF32 * 0.8f) + (time_1 * 0.35f));
          let cosAngle = cos(angle);
          let sinAngle = sin(angle);
          let rotatedX = ((aspectUv.x * cosAngle) - (aspectUv.y * sinAngle));
          let rotatedY = ((aspectUv.x * sinAngle) + (aspectUv.y * cosAngle));
          aspectUv = (vec2f(rotatedX, rotatedY) * (1.18f + (iterationF32 * 0.06f)));
          let radius = (length(aspectUv) + 1e-4f);
          let swirl = sin(((radius * 10f) - (time_1 * (1.2f + (iterationF32 * 0.2f)))));
          aspectUv = (aspectUv + vec2f((swirl * 0.02f), (swirl * -0.02f)));
          var radialLength = (length(aspectUv) * exp((-(length(originalUv)) * (1.2f + (iterationF32 * 0.08f)))));
          radialLength = (sin(((radialLength * (7.5f + iterationF32)) + (time_1 * (1f + (iterationF32 * 0.1f))))) / 8f);
          radialLength = abs(radialLength);
          radialLength = smoothstep(0f, 0.11f, radialLength);
          radialLength = ((0.06f + (iterationF32 * 5e-3f)) / (radialLength + 1e-5f));
          var paletteColor = palette(((length(originalUv) + (time_1 * 0.75f)) + (iterationF32 * 0.05f)));
          accumulatedColor = accumulate(accumulatedColor, paletteColor, radialLength);
        }
        return vec4f(accumulatedColor, 1f);
      }

      struct mainVertex_Output {
        @builtin(position) outPos: vec4f,
        @location(0) uv: vec2f,
      }

      struct mainVertex_Input {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertex(_arg_0: mainVertex_Input) -> mainVertex_Output {
        var pos = array<vec2f, 6>(vec2f(-1, 1), vec2f(-1), vec2f(1, -1), vec2f(-1, 1), vec2f(1, -1), vec2f(1));
        var uv = array<vec2f, 6>(vec2f(0, 1), vec2f(), vec2f(1, 0), vec2f(0, 1), vec2f(1, 0), vec2f(1));
        return mainVertex_Output(vec4f(pos[_arg_0.vertexIndex], 0f, 1f), uv[_arg_0.vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> resolutionUniform: vec2f;

      fn aspectCorrected(uv: vec2f) -> vec2f {
        var v = ((uv - 0.5f) * 2f);
        let aspect = (resolutionUniform.x / resolutionUniform.y);
        if ((aspect > 1f)) {
          v.x *= aspect;
        }
        else {
          v.y /= aspect;
        }
        return v;
      }

      @group(0) @binding(1) var<uniform> time: f32;

      fn palette(t: f32) -> vec3f {
        var a = vec3f(0.5, 0.5899999737739563, 0.8500000238418579);
        var b = vec3f(0.18000000715255737, 0.41999998688697815, 0.4000000059604645);
        var c = vec3f(0.18000000715255737, 0.47999998927116394, 0.4099999964237213);
        var e = vec3f(0.3499999940395355, 0.12999999523162842, 0.3199999928474426);
        var expr = cos((6.28318f * ((c * t) + e)));
        return (a + (b * expr));
      }

      fn accumulate(acc: vec3f, col: vec3f, weight: f32) -> vec3f {
        return (acc + (col * weight));
      }

      struct mainFragment1_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment1(_arg_0: mainFragment1_Input) -> @location(0) vec4f {
        var originalUv = aspectCorrected(_arg_0.uv);
        var aspectUv = originalUv;
        var accumulatedColor = vec3f();
        for (var iteration = 0; (iteration < 5i); iteration++) {
          aspectUv = (fract((aspectUv * (1.3f * sin(time)))) - 0.5f);
          var radialLength = (length(aspectUv) * exp((-(length(originalUv)) * 2f)));
          radialLength = (sin(((radialLength * 8f) + time)) / 8f);
          radialLength = abs(radialLength);
          radialLength = smoothstep(0f, 0.1f, radialLength);
          radialLength = (0.06f / radialLength);
          var paletteColor = palette((length(originalUv) + (time * 0.9f)));
          accumulatedColor = accumulate(accumulatedColor, paletteColor, radialLength);
        }
        return vec4f(accumulatedColor, 1f);
      }"
    `);
  });
});
