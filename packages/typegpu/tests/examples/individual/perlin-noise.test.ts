/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('perlin noise example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'perlin-noise',
      expectedCalls: 2,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct mainCompute_Input_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(0) var<uniform> size_2: vec4u;

      @group(0) @binding(1) var<storage, read_write> memory_3: array<vec3f>;

      var<private> seed_7: vec2f;

      fn seed3_6(value: vec3f) {
        seed_7 = (value.xy + vec2f(value.z));
      }

      fn randSeed3_5(seed: vec3f) {
        seed3_6(seed);
      }

      fn item_9() -> f32 {
        var a = dot(seed_7, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_7, vec2f(54.47856521606445, 345.8415222167969));
        seed_7.x = fract((cos(a) * 136.8168));
        seed_7.y = fract((cos(b) * 534.7645));
        return seed_7.y;
      }

      fn randOnUnitSphere_8() -> vec3f {
        var z = ((2 * item_9()) - 1);
        var oneMinusZSq = sqrt((1 - (z * z)));
        var theta = (6.283185307179586 * item_9());
        var x = (cos(theta) * oneMinusZSq);
        var y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      fn computeJunctionGradient_4(pos: vec3i) -> vec3f {
        randSeed3_5((1e-3 * vec3f(pos)));
        return randOnUnitSphere_8();
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(input: mainCompute_Input_1) {
        var size = size_2;
        var idx = ((input.gid.x + (input.gid.y * size.x)) + ((input.gid.z * size.x) * size.y));
        memory_3[idx] = computeJunctionGradient_4(vec3i(input.gid.xyz));
      }

      struct fullScreenTriangle_Input_11 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct fullScreenTriangle_Output_12 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle_10(input: fullScreenTriangle_Input_11) -> fullScreenTriangle_Output_12 {
        var pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        return fullScreenTriangle_Output_12(vec4f(pos[input.vertexIndex], 0, 1), (0.5 * pos[input.vertexIndex]));
      }

      struct mainFragment_Input_14 {
        @location(0) uv: vec2f,
      }

      @group(0) @binding(0) var<uniform> gridSize_15: f32;

      @group(0) @binding(1) var<uniform> time_16: f32;

      @group(1) @binding(0) var<uniform> perlin3dCache__size_20: vec4u;

      @group(1) @binding(1) var<storage, read> perlin3dCache__memory_21: array<vec3f>;

      fn getJunctionGradient_19(pos: vec3i) -> vec3f {
        var size = vec3i(perlin3dCache__size_20.xyz);
        var x = (((pos.x % size.x) + size.x) % size.x);
        var y = (((pos.y % size.y) + size.y) % size.y);
        var z = (((pos.z % size.z) + size.z) % size.z);
        return perlin3dCache__memory_21[((x + (y * size.x)) + ((z * size.x) * size.y))];
      }

      fn dotProdGrid_18(pos: vec3f, junction: vec3f) -> f32 {
        var relative = (pos - junction);
        var gridVector = getJunctionGradient_19(vec3i(junction));
        return dot(relative, gridVector);
      }

      fn quinticInterpolation3_22(t: vec3f) -> vec3f {
        return ((t * (t * t)) * ((t * ((t * 6) - 15)) + 10));
      }

      fn sample_17(pos: vec3f) -> f32 {
        var minJunction = floor(pos);
        var xyz = dotProdGrid_18(pos, minJunction);
        var xyZ = dotProdGrid_18(pos, (minJunction + vec3f(0, 0, 1)));
        var xYz = dotProdGrid_18(pos, (minJunction + vec3f(0, 1, 0)));
        var xYZ = dotProdGrid_18(pos, (minJunction + vec3f(0, 1, 1)));
        var Xyz = dotProdGrid_18(pos, (minJunction + vec3f(1, 0, 0)));
        var XyZ = dotProdGrid_18(pos, (minJunction + vec3f(1, 0, 1)));
        var XYz = dotProdGrid_18(pos, (minJunction + vec3f(1, 1, 0)));
        var XYZ = dotProdGrid_18(pos, (minJunction + vec3f(1)));
        var partial = (pos - minJunction);
        var smoothPartial = quinticInterpolation3_22(partial);
        var xy = mix(xyz, xyZ, smoothPartial.z);
        var xY = mix(xYz, xYZ, smoothPartial.z);
        var Xy = mix(Xyz, XyZ, smoothPartial.z);
        var XY = mix(XYz, XYZ, smoothPartial.z);
        var x = mix(xy, xY, smoothPartial.y);
        var X = mix(Xy, XY, smoothPartial.y);
        return mix(x, X, smoothPartial.x);
      }

      fn exponentialSharpen_23(n: f32, sharpness2: f32) -> f32 {
        return (sign(n) * pow(abs(n), (1 - sharpness2)));
      }

      @group(0) @binding(2) var<uniform> sharpness_24: f32;

      @fragment fn mainFragment_13(input: mainFragment_Input_14) -> @location(0) vec4f {
        var uv = (gridSize_15 * input.uv);
        var n = sample_17(vec3f(uv, time_16));
        var sharp = exponentialSharpen_23(n, sharpness_24);
        var n01 = ((sharp * 0.5) + 0.5);
        var dark = vec3f(0, 0.20000000298023224, 1);
        var light = vec3f(1, 0.30000001192092896, 0.5);
        return vec4f(mix(dark, light, n01), 1);
      }"
    `);
  });
});
