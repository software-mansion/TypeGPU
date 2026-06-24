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
      "struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(@builtin(vertex_index) vertexIndex: u32) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[vertexIndex], 0, 1), uv[vertexIndex]);
      }

      struct Camera {
        position: vec4f,
        targetPos: vec4f,
        view: mat4x4f,
        projection: mat4x4f,
        viewInverse: mat4x4f,
        projectionInverse: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> cameraUniform: Camera;

      struct Config {
        gridSize: f32,
        samplesPerThread: i32,
        takeAverage: i32,
        multiplier: f32,
        canvasRatio: f32,
      }

      @group(0) @binding(1) var<uniform> configUniform: Config;

      struct BoxIntersection {
        tNear: f32,
        tFar: f32,
        hit: bool,
      }

      fn getBoxIntersection(rayOrigin: vec3f, rayDir: vec3f, boxMin: vec3f, boxMax: vec3f) -> BoxIntersection {
        let invDir = (1f / rayDir);
        let t0 = ((boxMin - rayOrigin) * invDir);
        let t1 = ((boxMax - rayOrigin) * invDir);
        let tmin = min(t0, t1);
        let tmax = max(t0, t1);
        let tNear = max(max(tmin.x, tmin.y), tmin.z);
        let tFar = min(min(tmax.x, tmax.y), tmax.z);
        return BoxIntersection(tNear, tFar, (tFar >= tNear));
      }

      @group(1) @binding(0) var texture: texture_storage_3d<r32float, read>;

      struct FragmentIn {
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        let ndc = vec2f(((_arg_0.uv.x * 2f) - 1f), (1f - (_arg_0.uv.y * 2f)));
        let invViewProj = (cameraUniform.viewInverse * cameraUniform.projectionInverse);
        let worldNear = (invViewProj * vec4f(ndc, 0f, 1f));
        let worldFar = (invViewProj * vec4f(ndc, 1f, 1f));
        let rayOrigin = (worldNear.xyz / worldNear.w);
        let rayDir = normalize(((worldFar.xyz / worldFar.w) - rayOrigin));
        let gridSize = configUniform.gridSize;
        let boxMax = vec3f(gridSize);
        let isect = getBoxIntersection(rayOrigin, rayDir, vec3f(), boxMax);
        if (!isect.hit) {
          return vec4f();
        }
        let stepSize = ((isect.tFar - isect.tNear) / 64f);
        let opacity = ((stepSize / gridSize) * 3f);
        var transmittance = 1f;
        var accum = 0f;
        var i = 0;
        while (((i < 64i) && (transmittance > 1e-3f))) {
          let t = (isect.tNear + ((f32(i) + 0.5f) * stepSize));
          let pos = (rayOrigin + (rayDir * t));
          let value = textureLoad(texture, vec3u(clamp(pos, vec3f(), (boxMax - 1f)))).r;
          accum += ((value * opacity) * transmittance);
          transmittance *= (1f - opacity);
          i += 1i;
        }
        return vec4f(vec3f(accum), (1f - transmittance));
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct Config {
        gridSize: f32,
        samplesPerThread: i32,
        takeAverage: i32,
        multiplier: f32,
        canvasRatio: f32,
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

      @group(1) @binding(0) var texture: texture_storage_3d<r32float, write>;

      fn computeFn(x: u32, y: u32, z: u32) {
        let multiplier = configUniform.multiplier;
        randSeed2(((vec2f(f32(x), f32(y)) - (configUniform.gridSize / 2f)) * multiplier));
        let samplesPerThread = configUniform.samplesPerThread;
        let takeAverage = configUniform.takeAverage;
        var sum = 0f;
        for (var i = 0i; (i < (samplesPerThread - 1i)); i++) {
          sum += randFloat01();
        }
        var result = randFloat01();
        result += (sum * f32(takeAverage));
        let denominator = f32((1i + ((samplesPerThread - 1i) * takeAverage)));
        result /= denominator;
        textureStore(texture, vec3u(x, y, z), vec4f(result, 0f, 0f, 0f));
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
        if (any(id >= sizeUniform)) {
          return;
        }
        computeFn(id.x, id.y, id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct Config {
        gridSize: f32,
        samplesPerThread: i32,
        takeAverage: i32,
        multiplier: f32,
        canvasRatio: f32,
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

      var<private> seed: u32;

      fn seed2(value: vec2f) {
        let u32Value = bitcast<vec2u>(value);
        let hx = hash((u32Value.x ^ 1253408251u));
        let hy = hash((u32Value.y ^ 2900286023u));
        seed = hash((hx ^ rotl(hy, 16u)));
      }

      fn randSeed2(seed: vec2f) {
        seed2(seed);
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value & 8388607u);
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

      @group(1) @binding(0) var texture: texture_storage_3d<r32float, write>;

      fn computeFn(x: u32, y: u32, z: u32) {
        let multiplier = configUniform.multiplier;
        randSeed2(((vec2f(f32(x), f32(y)) - (configUniform.gridSize / 2f)) * multiplier));
        let samplesPerThread = configUniform.samplesPerThread;
        let takeAverage = configUniform.takeAverage;
        var sum = 0f;
        for (var i = 0i; (i < (samplesPerThread - 1i)); i++) {
          sum += randFloat01();
        }
        var result = randFloat01();
        result += (sum * f32(takeAverage));
        let denominator = f32((1i + ((samplesPerThread - 1i) * takeAverage)));
        result /= denominator;
        textureStore(texture, vec3u(x, y, z), vec4f(result, 0f, 0f, 0f));
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
        if (any(id >= sizeUniform)) {
          return;
        }
        computeFn(id.x, id.y, id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct Config {
        gridSize: f32,
        samplesPerThread: i32,
        takeAverage: i32,
        multiplier: f32,
        canvasRatio: f32,
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
        let u32Value = bitcast<vec2u>(value);
        let hx = hash((u32Value.x ^ 1253408251u));
        let hy = hash((u32Value.y ^ 2900286023u));
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
        let mantissa = (value & 8388607u);
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

      @group(1) @binding(0) var texture: texture_storage_3d<r32float, write>;

      fn computeFn(x: u32, y: u32, z: u32) {
        let multiplier = configUniform.multiplier;
        randSeed2(((vec2f(f32(x), f32(y)) - (configUniform.gridSize / 2f)) * multiplier));
        let samplesPerThread = configUniform.samplesPerThread;
        let takeAverage = configUniform.takeAverage;
        var sum = 0f;
        for (var i = 0i; (i < (samplesPerThread - 1i)); i++) {
          sum += randFloat01();
        }
        var result = randFloat01();
        result += (sum * f32(takeAverage));
        let denominator = f32((1i + ((samplesPerThread - 1i) * takeAverage)));
        result /= denominator;
        textureStore(texture, vec3u(x, y, z), vec4f(result, 0f, 0f, 0f));
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
        if (any(id >= sizeUniform)) {
          return;
        }
        computeFn(id.x, id.y, id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct Config {
        gridSize: f32,
        samplesPerThread: i32,
        takeAverage: i32,
        multiplier: f32,
        canvasRatio: f32,
      }

      @group(0) @binding(1) var<uniform> configUniform: Config;

      var<private> seed: vec2f;

      fn seed3(value: vec3f) {
        seed = (value.xy + vec2f(value.z));
      }

      fn randSeed3(seed: vec3f) {
        seed3(seed);
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

      @group(1) @binding(0) var texture: texture_storage_3d<r32float, write>;

      fn computeFn(x: u32, y: u32, z: u32) {
        let multiplier = configUniform.multiplier;
        randSeed3(((vec3f(f32(x), f32(y), f32(z)) - (configUniform.gridSize / 2f)) * multiplier));
        let samplesPerThread = configUniform.samplesPerThread;
        let takeAverage = configUniform.takeAverage;
        var sum = 0f;
        for (var i = 0i; (i < (samplesPerThread - 1i)); i++) {
          sum += randFloat01();
        }
        var result = randFloat01();
        result += (sum * f32(takeAverage));
        let denominator = f32((1i + ((samplesPerThread - 1i) * takeAverage)));
        result /= denominator;
        textureStore(texture, vec3u(x, y, z), vec4f(result, 0f, 0f, 0f));
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
        if (any(id >= sizeUniform)) {
          return;
        }
        computeFn(id.x, id.y, id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct Config {
        gridSize: f32,
        samplesPerThread: i32,
        takeAverage: i32,
        multiplier: f32,
        canvasRatio: f32,
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

      var<private> seed: u32;

      fn seed3(value: vec3f) {
        let u32Value = bitcast<vec3u>(value);
        let hx = hash((u32Value.x ^ 1253408251u));
        let hy = hash((u32Value.y ^ 2900286023u));
        let hz = hash((u32Value.z ^ 3164612939u));
        seed = hash((hash((hx ^ rotl(hy, 16u))) ^ hz));
      }

      fn randSeed3(seed: vec3f) {
        seed3(seed);
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value & 8388607u);
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

      @group(1) @binding(0) var texture: texture_storage_3d<r32float, write>;

      fn computeFn(x: u32, y: u32, z: u32) {
        let multiplier = configUniform.multiplier;
        randSeed3(((vec3f(f32(x), f32(y), f32(z)) - (configUniform.gridSize / 2f)) * multiplier));
        let samplesPerThread = configUniform.samplesPerThread;
        let takeAverage = configUniform.takeAverage;
        var sum = 0f;
        for (var i = 0i; (i < (samplesPerThread - 1i)); i++) {
          sum += randFloat01();
        }
        var result = randFloat01();
        result += (sum * f32(takeAverage));
        let denominator = f32((1i + ((samplesPerThread - 1i) * takeAverage)));
        result /= denominator;
        textureStore(texture, vec3u(x, y, z), vec4f(result, 0f, 0f, 0f));
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
        if (any(id >= sizeUniform)) {
          return;
        }
        computeFn(id.x, id.y, id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct Config {
        gridSize: f32,
        samplesPerThread: i32,
        takeAverage: i32,
        multiplier: f32,
        canvasRatio: f32,
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

      fn seed3(value: vec3f) {
        let u32Value = bitcast<vec3u>(value);
        let hx = hash((u32Value.x ^ 1253408251u));
        let hy = hash((u32Value.y ^ 2900286023u));
        let hz = hash((u32Value.z ^ 3164612939u));
        seed = vec2u(hash((hx ^ rotl(hz, 16u))), hash((rotl(hy, 16u) ^ hz)));
      }

      fn randSeed3(seed: vec3f) {
        seed3(seed);
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
        let mantissa = (value & 8388607u);
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

      @group(1) @binding(0) var texture: texture_storage_3d<r32float, write>;

      fn computeFn(x: u32, y: u32, z: u32) {
        let multiplier = configUniform.multiplier;
        randSeed3(((vec3f(f32(x), f32(y), f32(z)) - (configUniform.gridSize / 2f)) * multiplier));
        let samplesPerThread = configUniform.samplesPerThread;
        let takeAverage = configUniform.takeAverage;
        var sum = 0f;
        for (var i = 0i; (i < (samplesPerThread - 1i)); i++) {
          sum += randFloat01();
        }
        var result = randFloat01();
        result += (sum * f32(takeAverage));
        let denominator = f32((1i + ((samplesPerThread - 1i) * takeAverage)));
        result /= denominator;
        textureStore(texture, vec3u(x, y, z), vec4f(result, 0f, 0f, 0f));
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
        if (any(id >= sizeUniform)) {
          return;
        }
        computeFn(id.x, id.y, id.z);
      }"
    `);
  });
});
