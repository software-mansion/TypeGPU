/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import { mockResizeObserver } from './utils/commonMocks.ts';

describe('clouds example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'clouds',
        expectedCalls: 3,
        setupMocks: mockResizeObserver,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(1) @binding(1) var noiseTexture: texture_2d<f32>;

      @group(1) @binding(2) var sampler_1: sampler;

      fn precomputeNoise3d(pos: vec3f) -> f32 {
        let idx = floor(pos);
        let frac = fract(pos);
        let smooth_1 = ((frac * frac) * (3f - (2f * frac)));
        let texCoord0 = fract((((idx.xy + frac.xy) + (vec2f(37, 239) * idx.z)) / 32f));
        let texCoord1 = fract((((idx.xy + frac.xy) + (vec2f(37, 239) * (idx.z + 1f))) / 32f));
        let val0 = textureSampleLevel(noiseTexture, sampler_1, texCoord0, 0).x;
        let val1 = textureSampleLevel(noiseTexture, sampler_1, texCoord1, 0).x;
        return ((mix(val0, val1, smooth_1.z) * 2f) - 1f);
      }

      fn fbm(pos: vec3f) -> f32 {
        var sum = 0f;
        // unrolled iteration #0
        {
          sum += (precomputeNoise3d((pos * 1.4f)) * 1f);
        }
        // unrolled iteration #1
        {
          sum += (precomputeNoise3d((pos * 2.8f)) * 0.5f);
        }
        // unrolled iteration #2
        {
          sum += (precomputeNoise3d((pos * 5.6f)) * 0.25f);
        }
        return sum;
      }

      fn packF32ToTwo8unorm(value: f32) -> vec2f {
        let normalized = saturate(((value / 3.5f) + 0.5f));
        let quantized = u32(floor((normalized * 65535f)));
        let low = (quantized & 255u);
        let high = (quantized >> 8u);
        return (vec2f(f32(high), f32(low)) / 255f);
      }

      @group(1) @binding(3) var densityTexture: texture_storage_3d<rgba8unorm, write>;

      fn precomputeDensity(x: u32, y: u32, z: u32) {
        let uvw = ((vec3f(f32(x), f32(y), f32(z)) + 0.5f) / 256f);
        let worldPos = (uvw * 22.857142857142858f);
        let fbmValue = fbm(worldPos);
        let shadowFbmValue = fbm((worldPos + vec3f(1, 0, 0)));
        let packedFbm = packF32ToTwo8unorm(fbmValue);
        let packedShadowFbm = packF32ToTwo8unorm(shadowFbmValue);
        textureStore(densityTexture, vec3u(x, y, z), vec4f(packedFbm, packedShadowFbm));
      }

      @compute @workgroup_size(8, 8, 4) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
        if (any(id >= sizeUniform)) {
          return;
        }
        precomputeDensity(id.x, id.y, id.z);
      }

      struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(@builtin(vertex_index) vertexIndex: u32) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[vertexIndex], 0, 1), uv[vertexIndex]);
      }

      struct CloudsParams {
        time: f32,
        maxSteps: i32,
        maxDistance: f32,
      }

      @group(1) @binding(0) var<uniform> params: CloudsParams;

      fn hash(value: u32) -> u32 {
        {
          var x = (value ^ (value >> 17u));
          x *= 3982152891u;
          x ^= (x >> 11u);
          x *= 2890668881u;
          x ^= (x >> 15u);
          x *= 830770091u;
          x ^= (x >> 14u);
          return x;
        }
      }

      fn scrambleSeed2(value: vec2f) -> vec2u {
        let u32Value = bitcast<vec2u>(value);
        return vec2u(hash((u32Value.x ^ 1253408251u)), hash((u32Value.y ^ 2900286023u)));
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value & 8388607u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> seed_1: vec2f;

      fn seed2(value: vec2f) {
        let scrambled = scrambleSeed2(value);
        seed_1 = ((vec2f(u32To01F32(hash((scrambled.x ^ scrambled.y))), u32To01F32(hash((rotl(scrambled.x, 16u) ^ scrambled.y)))) * 2f) - 1f);
      }

      fn randSeed2(seed: vec2f) {
        seed2(seed);
      }

      @group(0) @binding(0) var<uniform> resolutionUniform: vec2f;

      fn getRayDirection(uv: vec2f) -> vec3f {
        let screenRes = (&resolutionUniform);
        let aspect = ((*screenRes).x / (*screenRes).y);
        var screenPos = ((uv - 0.5f) * 2f);
        screenPos = vec2f((screenPos.x * max(aspect, 1f)), (screenPos.y * max((1f / aspect), 1f)));
        return normalize(vec3f(screenPos.x, screenPos.y, 1f));
      }

      fn sample() -> f32 {
        let a = dot(seed_1, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed_1, vec2f(54.47856521606445, 345.8415222167969));
        seed_1.x = fract((cos(a) * 136.8168f));
        seed_1.y = fract((cos(b) * 534.7645f));
        return seed_1.y;
      }

      fn randFloat01() -> f32 {
        return sample();
      }

      @group(1) @binding(1) var densityTexture: texture_3d<f32>;

      @group(1) @binding(2) var sampler_1: sampler;

      fn unpackF32ToTwo8unorm(encoded: vec2f) -> f32 {
        let normalized = (((encoded.x * 256f) + encoded.y) / 257f);
        return (((normalized * 2f) - 1f) * 1.75f);
      }

      fn sampleDensityVolume(pos: vec3f) -> vec2f {
        let uvw = fract((pos / 22.857142857142858f));
        let sampled = textureSampleLevel(densityTexture, sampler_1, uvw, 0);
        return vec2f(unpackF32ToTwo8unorm(sampled.xy), unpackF32ToTwo8unorm(sampled.zw));
      }

      fn sampleDensities(pos: vec3f) -> vec2f {
        let fbmValues = sampleDensityVolume(pos);
        let coverage = (0.7f - (abs(pos.y) * 0.25f));
        let cloudDensity = (saturate((fbmValues.x + coverage)) - 0.5f);
        let shadowDensity = saturate(((fbmValues.y + 0.7f) - 0.5f));
        return vec2f(cloudDensity, shadowDensity);
      }

      fn raymarch(rayOrigin: vec3f, rayDir: vec3f) -> vec4f {
        var accum = vec4f();
        let params_1 = (&params);
        let maxSteps = (*params_1).maxSteps;
        let maxDepth = (*params_1).maxDistance;
        let stepSize = (1f / f32(maxSteps));
        let stepLength = (maxDepth / f32(maxSteps));
        var dist = (randFloat01() * stepSize);
        for (var i = 0; (i < maxSteps); i++) {
          let samplePos = (rayOrigin + ((rayDir * dist) * maxDepth));
          let densities = sampleDensities(samplePos);
          let cloudDensity = densities.x;
          if ((cloudDensity > 0f)) {
            let shadowDensity = densities.y;
            let shadow = saturate((cloudDensity - shadowDensity));
            let lightVal = mix(0.3f, 1f, shadow);
            let light = (vec3f(0.6600000262260437, 0.4949999749660492, 0.824999988079071) + ((vec3f(1, 0.699999988079071, 0.30000001192092896) * lightVal) * 0.9f));
            let color = mix(vec3f(1), vec3f(0.20000000298023224), cloudDensity);
            let lit = (color * light);
            let sampleOpacity = (1f - exp(((-(cloudDensity) * 4f) * stepLength)));
            let weight = (sampleOpacity * (0.88f - accum.a));
            let contrib = (vec4f(lit, 1f) * weight);
            accum += contrib;
            if ((accum.a >= 0.879f)) {
              break;
            }
          }
          dist += stepSize;
        }
        return accum;
      }

      struct FragmentIn {
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        let time = params.time;
        randSeed2((_arg_0.uv * time));
        let rayOrigin = vec3f((sin((time * 0.6f)) * 0.5f), ((cos((time * 0.8f)) * 0.5f) - 1f), (time * 1f));
        let rayDir = getRayDirection(_arg_0.uv);
        return raymarch(rayOrigin, rayDir);
      }

      struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(@builtin(vertex_index) vertexIndex: u32) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[vertexIndex], 0, 1), uv[vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> resolutionUniform: vec2f;

      fn getRayDirection(uv: vec2f) -> vec3f {
        let screenRes = (&resolutionUniform);
        let aspect = ((*screenRes).x / (*screenRes).y);
        var screenPos = ((uv - 0.5f) * 2f);
        screenPos = vec2f((screenPos.x * max(aspect, 1f)), (screenPos.y * max((1f / aspect), 1f)));
        return normalize(vec3f(screenPos.x, screenPos.y, 1f));
      }

      @group(1) @binding(0) var cloudTexture: texture_2d<f32>;

      @group(1) @binding(1) var sampler_1: sampler;

      struct FragmentIn {
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        let rayDir = getRayDirection(_arg_0.uv);
        let sunDir = vec3f(1, 0, 0);
        let sunDot = saturate(dot(rayDir, sunDir));
        let sunGlow = pow(sunDot, 1.371742112482853f);
        var skyCol = (vec3f(0.75, 0.6600000262260437, 0.8999999761581421) - ((vec3f(1, 0.699999988079071, 0.4300000071525574) * rayDir.y) * 0.35f));
        skyCol += (vec3f(1, 0.3700000047683716, 0.17000000178813934) * sunGlow);
        let halfTexel = (0.5f / vec2f(textureDimensions(cloudTexture)));
        var cloudCol = vec4f();
        // unrolled iteration #0
        {
          // unrolled iteration #0
          {
            cloudCol += (textureSample(cloudTexture, sampler_1, (_arg_0.uv + (halfTexel * vec2f(-1)))) * 0.25f);
          }
          // unrolled iteration #1
          {
            cloudCol += (textureSample(cloudTexture, sampler_1, (_arg_0.uv + (halfTexel * vec2f(-1, 1)))) * 0.25f);
          }
        }
        // unrolled iteration #1
        {
          // unrolled iteration #0
          {
            cloudCol += (textureSample(cloudTexture, sampler_1, (_arg_0.uv + (halfTexel * vec2f(1, -1)))) * 0.25f);
          }
          // unrolled iteration #1
          {
            cloudCol += (textureSample(cloudTexture, sampler_1, (_arg_0.uv + (halfTexel * vec2f(1)))) * 0.25f);
          }
        }
        let finalCol = ((skyCol * (1.1f - cloudCol.a)) + cloudCol.rgb);
        return vec4f(finalCol, 1f);
      }"
    `);
  });
});
