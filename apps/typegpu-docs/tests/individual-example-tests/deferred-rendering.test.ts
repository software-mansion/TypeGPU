/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import {
  mockCreateImageBitmap,
  mockFonts,
  mockImageLoading,
  mockResizeObserver,
} from './utils/commonMocks.ts';

describe('deferred-rendering example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'deferred-rendering',
        setupMocks: () => {
          mockFonts();
          mockImageLoading();
          mockResizeObserver();
          mockCreateImageBitmap({ width: 512, height: 256 });
        },
        expectedCalls: 3,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Surface {
        position: vec3f,
        normal: vec3f,
        uv: vec2f,
      }

      @group(0) @binding(0) var<storage, read_write> output: array<Surface, 10201>;

      fn sphere(u: f32, v: f32) -> vec3f {
        let theta = (v * 3.141592653589793f);
        let phi = (u * 6.283185307179586f);
        let sinTheta = sin(theta);
        return vec3f((sinTheta * cos(phi)), cos(theta), (sinTheta * sin(phi)));
      }

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

      fn scrambleSeed3(value: vec3f) -> vec3u {
        let u32Value = bitcast<vec3u>(value);
        return vec3u(hash((u32Value.x ^ 1253408251u)), hash((u32Value.y ^ 2900286023u)), hash((u32Value.z ^ 3164612939u)));
      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> gpuSeed: vec2u;

      fn seed3(value: vec3f) {
        let scrambled = scrambleSeed3(value);
        let newSeed = vec2u(hash((scrambled.x ^ rotl(scrambled.z, 16u))), hash((rotl(scrambled.y, 16u) ^ scrambled.z)));
        gpuSeed = newSeed;
      }

      fn randSeed3(seed: vec3f) {
        seed3(seed);
      }

      fn next() -> u32 {
        {
          let s0 = gpuSeed.x;
          var s1 = gpuSeed.y;
          s1 ^= s0;
          gpuSeed.x = ((rotl(s0, 26u) ^ s1) ^ (s1 << 9u));
          gpuSeed.y = rotl(s1, 13u);
          return (rotl((gpuSeed.x * 2654435771u), 5u) * 5u);
        }
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value & 8388607u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample_1() -> f32 {
        let r = next();
        return u32To01F32(r);
      }

      fn randOnUnitSphere() -> vec3f {
        let z = ((2f * sample_1()) - 1f);
        let oneMinusZSq = sqrt((1f - (z * z)));
        let theta = (6.283185307179586f * sample_1());
        let x = (cos(theta) * oneMinusZSq);
        let y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      fn computeJunctionGradient(pos: vec3i) -> vec3f {
        randSeed3((1e-3f * vec3f(pos)));
        return randOnUnitSphere();
      }

      fn dotProdGrid(pos: vec3f, junction: vec3f) -> f32 {
        let relative = (pos - junction);
        let gridVector = computeJunctionGradient(vec3i(junction));
        return dot(relative, gridVector);
      }

      fn quinticInterpolation(t: vec3f) -> vec3f {
        return (((t * t) * t) * ((t * ((t * 6f) - 15f)) + 10f));
      }

      fn sample(pos: vec3f) -> f32 {
        let minJunction = floor(pos);
        let xyz = dotProdGrid(pos, minJunction);
        let xyZ = dotProdGrid(pos, (minJunction + vec3f(0, 0, 1)));
        let xYz = dotProdGrid(pos, (minJunction + vec3f(0, 1, 0)));
        let xYZ = dotProdGrid(pos, (minJunction + vec3f(0, 1, 1)));
        let Xyz = dotProdGrid(pos, (minJunction + vec3f(1, 0, 0)));
        let XyZ = dotProdGrid(pos, (minJunction + vec3f(1, 0, 1)));
        let XYz = dotProdGrid(pos, (minJunction + vec3f(1, 1, 0)));
        let XYZ = dotProdGrid(pos, (minJunction + vec3f(1)));
        let partial = (pos - minJunction);
        let smoothPartial = quinticInterpolation(partial);
        let xy = mix(xyz, xyZ, smoothPartial.z);
        let xY = mix(xYz, xYZ, smoothPartial.z);
        let Xy = mix(Xyz, XyZ, smoothPartial.z);
        let XY = mix(XYz, XYZ, smoothPartial.z);
        let x = mix(xy, xY, smoothPartial.y);
        let X = mix(Xy, XY, smoothPartial.y);
        return mix(x, X, smoothPartial.x);
      }

      fn at(u: f32, v: f32) -> vec3f {
        let p = (sphere(u, v) * 3f);
        return (p * (1f + (sample(p) / 10f)));
      }

      fn item_2(u: f32, v: f32) -> vec3f {
        let vv = clamp(v, 2e-3f, 0.998f);
        let du = (at(min((u + 1e-3f), 1f), vv) - at(max((u - 1e-3f), 0f), vv));
        let dv = (at(u, (vv + 1e-3f)) - at(u, (vv - 1e-3f)));
        let normal = cross(du, dv);
        if ((dot(normal, normal) > 0f)) {
          return normalize(normal);
        }
        return vec3f();
      }

      fn item_1(u: f32, v: f32) -> Surface {
        return Surface(at(u, v), item_2(u, v), vec2f(u, v));
      }

      fn vertexAt(i: u32) -> Surface {
        let col = (i % 101u);
        let row = (i / 101u);
        let u = (f32(col) / 100f);
        let v = (f32(row) / 100f);
        return item_1(u, v);
      }

      fn item(i: u32) {
        output[i] = vertexAt(i);
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let i = (gid.x + (gid.y * 10240u));
        if ((i < 10201u)) {
          item(i);
        }
      }

      @group(0) @binding(0) var<storage, read_write> output: array<u32, 60000>;

      const QUAD: array<vec2u, 6> = array<vec2u, 6>(vec2u(), vec2u(1, 0), vec2u(1), vec2u(), vec2u(1), vec2u(0, 1));

      fn indexAt(i: u32) -> u32 {
        let cell = (i / 6u);
        let corner = QUAD[(i % 6u)];
        let col = ((cell % 100u) + corner.x);
        let row = ((cell / 100u) + corner.y);
        return ((row * 101u) + col);
      }

      fn item(i: u32) {
        output[i] = indexAt(i);
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let i = (gid.x + (gid.y * 60032u));
        if ((i < 60000u)) {
          item(i);
        }
      }

      @group(0) @binding(0) var<storage, read_write> output: array<u32, 67146>;

      const QUAD: array<vec2u, 6> = array<vec2u, 6>(vec2u(), vec2u(1, 0), vec2u(1), vec2u(), vec2u(1), vec2u(0, 1));

      fn indexAt_1(i: u32) -> u32 {
        let cell = (i / 6u);
        let corner = QUAD[(i % 6u)];
        let col = ((cell % 1u) + corner.x);
        let row = ((cell / 1u) + corner.y);
        return ((row * 2u) + col);
      }

      fn indexAt_2(i: u32) -> u32 {
        let cell = (i / 6u);
        let corner = QUAD[(i % 6u)];
        let col = ((cell % 48u) + corner.x);
        let row = ((cell / 48u) + corner.y);
        return ((row * 49u) + col);
      }

      fn indexAt_4(i: u32) -> u32 {
        let cell = (i / 6u);
        let corner = QUAD[(i % 6u)];
        let col = ((cell % 1u) + corner.x);
        let row = ((cell / 1u) + corner.y);
        return ((row * 2u) + col);
      }

      fn indexAt_5(i: u32) -> u32 {
        let cell = (i / 6u);
        let corner = QUAD[(i % 6u)];
        let col = ((cell % 1u) + corner.x);
        let row = ((cell / 1u) + corner.y);
        return ((row * 2u) + col);
      }

      fn indexAt_6(i: u32) -> u32 {
        let cell = (i / 6u);
        let corner = QUAD[(i % 6u)];
        let col = ((cell % 1u) + corner.x);
        let row = ((cell / 1u) + corner.y);
        return ((row * 2u) + col);
      }

      fn indexAt_3(i: u32) -> u32 {
        var local = i;
        // unrolled iteration #2 / #0
        if ((local < 6u)) {
          return (indexAt_4(local) + 0u);
        }
        local -= 6u;
        // unrolled iteration #2 / #1
        if ((local < 6u)) {
          return (indexAt_4(local) + 4u);
        }
        local -= 6u;
        // unrolled iteration #2 / #2
        if ((local < 6u)) {
          return (indexAt_5(local) + 8u);
        }
        local -= 6u;
        // unrolled iteration #2 / #3
        if ((local < 6u)) {
          return (indexAt_5(local) + 12u);
        }
        local -= 6u;
        // unrolled iteration #2 / #4
        if ((local < 6u)) {
          return (indexAt_6(local) + 16u);
        }
        local -= 6u;
        // unrolled iteration #2 / #5
        if ((local < 6u)) {
          return (indexAt_6(local) + 20u);
        }
        local -= 6u;
        // ---
        return 0u;
      }

      fn indexAt_9(i: u32) -> u32 {
        let cell = (i / 6u);
        let corner = QUAD[(i % 6u)];
        let col = ((cell % 32u) + corner.x);
        let row = ((cell / 32u) + corner.y);
        return ((row * 33u) + col);
      }

      fn indexAt_8(i: u32) -> u32 {
        if ((i < 96u)) {
          return indexAt_9(((((i / 3u) * 6u) + (i % 3u)) + 3u));
        }
        return indexAt_9((i + 96u));
      }

      fn indexAt_10(i: u32) -> u32 {
        let triangle = (i / 3u);
        if (((i % 3u) == 0u)) {
          return 0;
        }
        if (((i % 3u) == 1u)) {
          return (((triangle + 1u) % 32u) + 1u);
        }
        return (triangle + 1u);
      }

      fn indexAt_7(i: u32) -> u32 {
        var local = i;
        // unrolled iteration #3 / #0
        if ((local < 96u)) {
          return (indexAt_8(local) + 0u);
        }
        local -= 96u;
        // unrolled iteration #3 / #1
        if ((local < 96u)) {
          return (indexAt_10(local) + 66u);
        }
        local -= 96u;
        // ---
        return 0u;
      }

      @group(0) @binding(1) var<storage, read> output_1: array<u32, 60000>;

      fn indexAt_11(i: u32) -> u32 {
        return output_1[i];
      }

      fn indexAt(i: u32) -> u32 {
        var local = i;
        // unrolled iteration #0
        if ((local < 6u)) {
          return (indexAt_1(local) + 0u);
        }
        local -= 6u;
        // unrolled iteration #1
        if ((local < 6912u)) {
          return (indexAt_2(local) + 4u);
        }
        local -= 6912u;
        // unrolled iteration #2
        if ((local < 36u)) {
          return (indexAt_3(local) + 1229u);
        }
        local -= 36u;
        // unrolled iteration #3
        if ((local < 192u)) {
          return (indexAt_7(local) + 1253u);
        }
        local -= 192u;
        // unrolled iteration #4
        if ((local < 60000u)) {
          return (indexAt_11(local) + 1352u);
        }
        local -= 60000u;
        // ---
        return 0u;
      }

      fn item(i: u32) {
        output[i] = indexAt(i);
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let i = (gid.x + (gid.y * 67200u));
        if ((i < 67146u)) {
          item(i);
        }
      }"
    `);
  });
});
