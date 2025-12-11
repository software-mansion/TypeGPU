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

      @group(0) @binding(0) var<uniform> canvasRatioUniform: f32;

      @group(0) @binding(1) var<uniform> gridSizeUniform: f32;

      var<private> seed: vec2f;

      fn seed2(value: vec2f) {
        seed = value;
      }

      fn randSeed2(seed: vec2f) {
        seed2(seed);
      }

      fn item_1() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randFloat01() -> f32 {
        return item_1();
      }

      struct _Input {
        @location(0) uv: vec2f,
      }

      @fragment fn item(input: _Input) -> @location(0) vec4f {
        var uv = (((input.uv + 1) / 2) * vec2f(canvasRatioUniform, 1f));
        var gridedUV = floor((uv * gridSizeUniform));
        randSeed2(gridedUV);
        return vec4f(vec3f(randFloat01()), 1f);
      }

      struct fullScreenTriangle_Input {
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

      @group(0) @binding(0) var<uniform> canvasRatioUniform: f32;

      @group(0) @binding(1) var<uniform> gridSizeUniform: f32;

      var<private> seed: u32;

      fn item_1(value: vec2f) {
        seed = u32(((value.x * 32768f) + (value.y * 1024f)));
      }

      fn randSeed2(seed: vec2f) {
        item_1(seed);
      }

      fn u32To01Float(val: u32) -> f32{
          let exponent: u32 = 0x3f800000;
          let mantissa: u32 = 0x007fffff & val;
          var ufloat: u32 = (exponent | mantissa);
          return bitcast<f32>(ufloat) - 1f;
        }

      fn item_2() -> f32 {
        seed = ((seed * 1664525u) + 1013904223u);
        return u32To01Float(seed);
      }

      fn randFloat01() -> f32 {
        return item_2();
      }

      struct _Input {
        @location(0) uv: vec2f,
      }

      @fragment fn item(input: _Input) -> @location(0) vec4f {
        var uv = (((input.uv + 1) / 2) * vec2f(canvasRatioUniform, 1f));
        var gridedUV = floor((uv * gridSizeUniform));
        randSeed2(gridedUV);
        return vec4f(vec3f(randFloat01()), 1f);
      }"
    `);
  });
});
