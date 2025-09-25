/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockResizeObserver } from '../utils/commonMocks.ts';

describe('uniformity test example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'tests',
      name: 'uniformity',
      setupMocks: mockResizeObserver,
      controlTriggers: ['Test Resolution'],
      expectedCalls: 2,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct fullScreenTriangleVertexShader_Output_1 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct fullScreenTriangleVertexShader_Input_2 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn fullScreenTriangleVertexShader_0(input: fullScreenTriangleVertexShader_Input_2) -> fullScreenTriangleVertexShader_Output_1 {
        var pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        return fullScreenTriangleVertexShader_Output_1(vec4f(pos[input.vertexIndex], 0, 1), pos[input.vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> canvasRatioUniform_4: f32;

      @group(0) @binding(1) var<uniform> gridSizeUniform_5: f32;

      var<private> seed_8: vec2f;

      fn seed2_7(value: vec2f) {
        seed_8 = value;
      }

      fn randSeed2_6(seed: vec2f) {
        seed2_7(seed);
      }

      fn item_10() -> f32 {
        var a = dot(seed_8, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_8, vec2f(54.47856521606445, 345.8415222167969));
        seed_8.x = fract((cos(a) * 136.8168));
        seed_8.y = fract((cos(b) * 534.7645));
        return seed_8.y;
      }

      fn randFloat01_9() -> f32 {
        return item_10();
      }

      struct _Input_11 {
        @location(0) uv: vec2f,
      }

      @fragment fn item_3(input: _Input_11) -> @location(0) vec4f {
        var uv = (((input.uv + 1) / 2) * vec2f(canvasRatioUniform_4, 1));
        var gridedUV = floor((uv * gridSizeUniform_5));
        randSeed2_6(gridedUV);
        return vec4f(vec3f(randFloat01_9()), 1);
      }

      struct fullScreenTriangleVertexShader_Output_1 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct fullScreenTriangleVertexShader_Input_2 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn fullScreenTriangleVertexShader_0(input: fullScreenTriangleVertexShader_Input_2) -> fullScreenTriangleVertexShader_Output_1 {
        var pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        return fullScreenTriangleVertexShader_Output_1(vec4f(pos[input.vertexIndex], 0, 1), pos[input.vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> canvasRatioUniform_4: f32;

      @group(0) @binding(1) var<uniform> gridSizeUniform_5: f32;

      var<private> seed_8: u32;

      fn seed2_7(value: vec2f) {
        seed_8 = u32(((value.x * 32768) + (value.y * 1024)));
      }

      fn randSeed2_6(seed: vec2f) {
        seed2_7(seed);
      }

      fn u32ToFloat_11(val: u32) -> f32{
          let exponent: u32 = 0x3f800000;
          let mantissa: u32 = 0x007fffff & val;
          var ufloat: u32 = (exponent | mantissa);
          return bitcast<f32>(ufloat) - 1f;
        }

      fn item_10() -> f32 {
        seed_8 = ((seed_8 * 1664525) + 1013904223);
        return u32ToFloat_11(seed_8);
      }

      fn randFloat01_9() -> f32 {
        return item_10();
      }

      struct _Input_12 {
        @location(0) uv: vec2f,
      }

      @fragment fn item_3(input: _Input_12) -> @location(0) vec4f {
        var uv = (((input.uv + 1) / 2) * vec2f(canvasRatioUniform_4, 1));
        var gridedUV = floor((uv * gridSizeUniform_5));
        randSeed2_6(gridedUV);
        return vec4f(vec3f(randFloat01_9()), 1);
      }"
    `);
  });
});
