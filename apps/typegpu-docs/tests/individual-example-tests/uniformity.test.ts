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
        expectedCalls: 3,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct Config {
        gridSize: f32,
        canvasRatio: f32,
        useSeed2: u32,
        samplesPerThread: u32,
        takeAverage: u32,
      }

      @group(0) @binding(1) var<uniform> configUniform: Config;

      var<private> seed: vec2f;

      fn seed2(value: vec2f) {
        seed = value;
      }

      fn randSeed2(seed: vec2f) {
        seed2(seed);
      }

      fn seed_2(value: f32) {
        seed = vec2f(value, 0f);
      }

      fn randSeed(seed_1: f32) {
        seed_2(seed_1);
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

      @group(1) @binding(0) var texture: texture_storage_2d<r32float, write>;

      fn computeFn(x: u32, y: u32, _arg_2: u32) {
        let gridSize2 = configUniform.gridSize;
        if ((configUniform.useSeed2 == 1u)) {
          randSeed2(vec2f(f32(x), f32(y)));
        }
        else {
          randSeed(((f32(x) * gridSize2) + f32(y)));
        }
        var i = 0u;
        let samplesPerThread = configUniform.samplesPerThread;
        var samples = 0f;
        while ((i < (samplesPerThread - 1u))) {
          samples += randFloat01();
          i += 1u;
        }
        var result = randFloat01();
        if ((configUniform.takeAverage == 1u)) {
          result = ((result + samples) / f32(samplesPerThread));
        }
        textureStore(texture, vec2u(x, y), vec4f(result, 0f, 0f, 0f));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        computeFn(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct Config {
        gridSize: f32,
        canvasRatio: f32,
        useSeed2: u32,
        samplesPerThread: u32,
        takeAverage: u32,
      }

      @group(0) @binding(1) var<uniform> configUniform: Config;

      fn randSeed2(seed: vec2f) {

      }

      fn hash(v: u32) -> u32 {
        var x = (v ^ (v >> 17u));
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

      fn u32To01Float(value: u32) -> f32 {
        let mantissa = (value >> 9u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        seed = ((seed * 1664525u) + 1013904223u);
        return u32To01Float(seed);
      }

      fn randFloat01() -> f32 {
        return sample();
      }

      @group(1) @binding(0) var texture: texture_storage_2d<r32float, write>;

      fn computeFn(x: u32, y: u32, _arg_2: u32) {
        let gridSize2 = configUniform.gridSize;
        if ((configUniform.useSeed2 == 1u)) {
          randSeed2(vec2f(f32(x), f32(y)));
        }
        else {
          randSeed(((f32(x) * gridSize2) + f32(y)));
        }
        var i = 0u;
        let samplesPerThread = configUniform.samplesPerThread;
        var samples = 0f;
        while ((i < (samplesPerThread - 1u))) {
          samples += randFloat01();
          i += 1u;
        }
        var result = randFloat01();
        if ((configUniform.takeAverage == 1u)) {
          result = ((result + samples) / f32(samplesPerThread));
        }
        textureStore(texture, vec2u(x, y), vec4f(result, 0f, 0f, 0f));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        computeFn(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct Config {
        gridSize: f32,
        canvasRatio: f32,
        useSeed2: u32,
        samplesPerThread: u32,
        takeAverage: u32,
      }

      @group(0) @binding(1) var<uniform> configUniform: Config;

      fn hash(v: u32) -> u32 {
        var x = (v ^ (v >> 17u));
        x *= 3982152891u;
        x ^= (x >> 11u);
        x *= 2890668881u;
        x ^= (x >> 15u);
        x *= 830770091u;
        x ^= (x >> 14u);
        return x;
      }

      var<private> seed: vec2u;

      fn seed2(value: vec2f) {
        seed = vec2u(hash(u32(value.x)), hash(u32(value.y)));
      }

      fn randSeed2(seed: vec2f) {
        seed2(seed);
      }

      fn randSeed(seed_1: f32) {

      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      fn next() -> u32 {
        let s0 = seed[0i];
        var s1 = seed[1i];
        s1 ^= s0;
        seed[0i] = ((rotl(s0, 26u) ^ s1) ^ (s1 << 9u));
        seed[1i] = rotl(s1, 13u);
        return (rotl((seed[0i] * 2654435771u), 5u) * 5u);
      }

      fn u32To01Float(value: u32) -> f32 {
        let mantissa = (value >> 9u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        let r = next();
        return u32To01Float(r);
      }

      fn randFloat01() -> f32 {
        return sample();
      }

      @group(1) @binding(0) var texture: texture_storage_2d<r32float, write>;

      fn computeFn(x: u32, y: u32, _arg_2: u32) {
        let gridSize2 = configUniform.gridSize;
        if ((configUniform.useSeed2 == 1u)) {
          randSeed2(vec2f(f32(x), f32(y)));
        }
        else {
          randSeed(((f32(x) * gridSize2) + f32(y)));
        }
        var i = 0u;
        let samplesPerThread = configUniform.samplesPerThread;
        var samples = 0f;
        while ((i < (samplesPerThread - 1u))) {
          samples += randFloat01();
          i += 1u;
        }
        var result = randFloat01();
        if ((configUniform.takeAverage == 1u)) {
          result = ((result + samples) / f32(samplesPerThread));
        }
        textureStore(texture, vec2u(x, y), vec4f(result, 0f, 0f, 0f));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        computeFn(in.id.x, in.id.y, in.id.z);
      }"
    `);
  });
});
