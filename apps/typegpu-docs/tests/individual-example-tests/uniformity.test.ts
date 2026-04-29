/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import { mockResizeObserver } from './utils/commonMocks.ts';

describe('uniformity test example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'tests',
        name: 'uniformity',
        setupMocks: mockResizeObserver,
        controlTriggers: ['Test Resolution'],
        expectedCalls: 4,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct Config {
        gridSize: f32,
        canvasRatio: f32,
        samplesPerThread: u32,
        takeAverage: u32,
      }

      @vertex fn fullScreenTriangle(@builtin(vertex_index) vertexIndex: u32) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[vertexIndex], 0, 1), uv[vertexIndex]);
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

      struct fragmentShader_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentShader(_arg_0: fragmentShader_Input) -> @location(0) vec4f {
        var uv = (((_arg_0.uv + 1f) / 2f) * vec2f(canvasRatioUniform, 1f));
        var gridedUV = floor((uv * gridSizeUniform));
        randSeed2(gridedUV);
        return vec4f(vec3f(randFloat01()), 1f);
      }

      var<private> seed_1: u32;

      struct Config {
        gridSize: f32,
        canvasRatio: f32,
        samplesPerThread: u32,
        takeAverage: u32,
      }

      @group(0) @binding(1) var<uniform> configUniform: Config;

      fn hash(value: u32) -> u32 {
        var x = (value ^ (value >> 17u));
        x *= 3982152891u;
        x ^= (x >> 11u);
        x *= 2890668881u;
        x ^= (x >> 15u);
        x *= 830770091u;
        x ^= (x >> 14u);
        return x;
      }

      var<private> seed: u32;

      fn seed_1(value: f32) {
        seed = hash(u32(value));
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value >> 9u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        seed = ((1664525u * seed) + 1013904223u);
        return u32To01F32(seed);
      }

      fn randFloat01() -> f32 {
        return sample();
      }

      struct fragmentShader_Input_1 {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentShader_1(_arg_0: fragmentShader_Input_1) -> @location(0) vec4f {
        var uv = (((_arg_0.uv + 1f) / 2f) * vec2f(canvasRatioUniform, 1f));
        var gridedUV = floor((uv * gridSizeUniform));
        randSeed2_1(gridedUV);
        return vec4f(vec3f(randFloat01_1()), 1f);
      }"
    `);
  });
});
