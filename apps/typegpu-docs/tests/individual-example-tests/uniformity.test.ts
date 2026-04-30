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

      @group(0) @binding(1) var<uniform> configUniform: Config;

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

      @group(1) @binding(0) var texture: texture_storage_2d<r32float, write>;

      fn computeFn(x: u32, y: u32, _arg_2: u32) {
        let gridSize = configUniform.gridSize;
        {
          randSeed2((vec2f(f32(x), f32(y)) + 1f));
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

      @compute @workgroup_size(16, 16, 1) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
        if (any(id >= sizeUniform)) {
          return;
        }
        computeFn(id.x, id.y, id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

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

      @group(1) @binding(0) var texture: texture_storage_2d<r32float, write>;

      fn computeFn(x: u32, y: u32, _arg_2: u32) {
        let gridSize = configUniform.gridSize;
        {
          randSeed(((f32((x + 1u)) * gridSize) + f32((y + 1u))));
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

      @compute @workgroup_size(16, 16, 1) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
        if (any(id >= sizeUniform)) {
          return;
        }
        computeFn(id.x, id.y, id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

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

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> seed: vec2u;

      fn seed2(value: vec2f) {
        let hx = hash((u32(value.x) ^ 2135587861u));
        let hy = hash((u32(value.y) ^ 2654435769u));
        seed = vec2u(hash((hx ^ hy)), hash((rotl(hx, 16u) ^ hy)));
      }

      fn randSeed2(seed: vec2f) {
        seed2(seed);
      }

      fn u64Mul(a: vec2u, b: vec2u) -> vec2u {
        let all_1 = (a.x & 65535u);
        let alh = (a.x >> 16u);
        let ahl = (a.y & 65535u);
        let ahh = (a.y >> 16u);
        let bll = (b.x & 65535u);
        let blh = (b.x >> 16u);
        let bhl = (b.y & 65535u);
        let bhh = (b.y >> 16u);
        let row0_0 = (bll * all_1);
        let row0_1 = (bll * alh);
        let row0_2 = (bll * ahl);
        let row0_3 = (bll * ahh);
        let row1_0 = (blh * all_1);
        let row1_1 = (blh * alh);
        let row1_2 = (blh * ahl);
        let row2_0 = (bhl * all_1);
        let row2_1 = (bhl * alh);
        let row3_0 = (bhh * all_1);
        let r1 = (row0_0 & 65535u);
        var r2 = (((row0_0 >> 16u) + (row0_1 & 65535u)) + (row1_0 & 65535u));
        var r3 = (((((row0_1 >> 16u) + (row0_2 & 65535u)) + (row1_0 >> 16u)) + (row1_1 & 65535u)) + (row2_0 & 65535u));
        var r4 = (((((((row0_2 >> 16u) + (row0_3 & 65535u)) + (row1_1 >> 16u)) + (row1_2 & 65535u)) + (row2_0 >> 16u)) + (row2_1 & 65535u)) + (row3_0 & 65535u));
        r3 += (r2 >> 16u);
        r2 &= 65535u;
        r4 += (r3 >> 16u);
        r3 &= 65535u;
        r4 &= 65535u;
        return vec2u((r1 | (r2 << 16u)), (r3 | (r4 << 16u)));
      }

      fn u64Add(a: vec2u, b: vec2u) -> vec2u {
        let rl = (a.x + b.x);
        let carry = u32(((rl < a.x) && (rl < b.x)));
        let rh = ((a.y + b.y) + carry);
        return vec2u(rl, rh);
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value >> 9u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        seed = u64Add(u64Mul(seed, vec2u(1284865837, 1481765933)), vec2u(1, 0));
        return u32To01F32(seed.y);
      }

      fn randFloat01() -> f32 {
        return sample();
      }

      @group(1) @binding(0) var texture: texture_storage_2d<r32float, write>;

      fn computeFn(x: u32, y: u32, _arg_2: u32) {
        let gridSize = configUniform.gridSize;
        {
          randSeed2((vec2f(f32(x), f32(y)) + 1f));
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

      @compute @workgroup_size(16, 16, 1) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
        if (any(id >= sizeUniform)) {
          return;
        }
        computeFn(id.x, id.y, id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

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

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> seed: vec2u;

      fn seed2(value: vec2f) {
        let hx = hash((u32(value.x) ^ 2135587861u));
        let hy = hash((u32(value.y) ^ 2654435769u));
        seed = vec2u(hash((hx ^ hy)), hash((rotl(hx, 16u) ^ hy)));
      }

      fn randSeed2(seed: vec2f) {
        seed2(seed);
      }

      fn next() -> u32 {
        let s0 = seed[0i];
        var s1 = seed[1i];
        s1 ^= s0;
        seed[0i] = ((rotl(s0, 26u) ^ s1) ^ (s1 << 9u));
        seed[1i] = rotl(s1, 13u);
        return (rotl((seed[0i] * 2654435771u), 5u) * 5u);
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value >> 9u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        let r = next();
        return u32To01F32(r);
      }

      fn randFloat01() -> f32 {
        return sample();
      }

      @group(1) @binding(0) var texture: texture_storage_2d<r32float, write>;

      fn computeFn(x: u32, y: u32, _arg_2: u32) {
        let gridSize = configUniform.gridSize;
        {
          randSeed2((vec2f(f32(x), f32(y)) + 1f));
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

      @compute @workgroup_size(16, 16, 1) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
        if (any(id >= sizeUniform)) {
          return;
        }
        computeFn(id.x, id.y, id.z);
      }"
    `);
  });
});
