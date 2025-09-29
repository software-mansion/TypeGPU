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
      "@group(0) @binding(0) var<uniform> size_1: vec4u;

      @group(0) @binding(1) var<storage, read_write> memory_2: array<vec3f>;

      var<private> seed_6: vec2f;

      fn seed3_5(value: vec3f) {
        seed_6 = (value.xy + vec2f(value.z));
      }

      fn randSeed3_4(seed: vec3f) {
        seed3_5(seed);
      }

      fn item_8() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randOnUnitSphere_7() -> vec3f {
        var z = ((2 * item_8()) - 1);
        var oneMinusZSq = sqrt((1 - (z * z)));
        var theta = (6.283185307179586 * item_8());
        var x = (cos(theta) * oneMinusZSq);
        var y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      fn computeJunctionGradient_3(pos: vec3i) -> vec3f {
        randSeed3_4((1e-3 * vec3f(pos)));
        return randOnUnitSphere_7();
      }

      struct mainCompute_Input_9 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(input: mainCompute_Input_9) {
        var size = size_1;
        var idx = ((input.gid.x + (input.gid.y * size.x)) + ((input.gid.z * size.x) * size.y));
        memory_2[idx] = computeJunctionGradient_3(vec3i(input.gid.xyz));
      }

      struct fullScreenTriangle_Output_1 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct fullScreenTriangle_Input_2 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn fullScreenTriangle_0(input: fullScreenTriangle_Input_2) -> fullScreenTriangle_Output_1 {
        var pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        return fullScreenTriangle_Output_1(vec4f(pos[input.vertexIndex], 0, 1), (0.5 * pos[input.vertexIndex]));
      }

      @group(0) @binding(0) var<uniform> gridSize_4: f32;

      @group(0) @binding(1) var<uniform> time_5: f32;

      @group(1) @binding(0) var<uniform> perlin3dCache__size_9: vec4u;

      @group(1) @binding(1) var<storage, read> perlin3dCache__memory_10: array<vec3f>;

      fn getJunctionGradient_8(pos: vec3i) -> vec3f {
        var size = vec3i(perlin3dCache__size_9.xyz);
        var x = (((pos.x % size.x) + size.x) % size.x);
        var y = (((pos.y % size.y) + size.y) % size.y);
        var z = (((pos.z % size.z) + size.z) % size.z);
        return perlin3dCache__memory_10[((x + (y * size.x)) + ((z * size.x) * size.y))];
      }

      fn dotProdGrid_7(pos: vec3f, junction: vec3f) -> f32 {
        var relative = (pos - junction);
        var gridVector = getJunctionGradient_8(vec3i(junction));
        return dot(relative, gridVector);
      }

      fn quinticInterpolation3_11(t: vec3f) -> vec3f {
        return ((t * (t * t)) * ((t * ((t * 6) - 15)) + 10));
      }

      fn sample_6(pos: vec3f) -> f32 {
        var minJunction = floor(pos);
        var xyz = dotProdGrid_7(pos, minJunction);
        var xyZ = dotProdGrid_7(pos, (minJunction + vec3f(0, 0, 1)));
        var xYz = dotProdGrid_7(pos, (minJunction + vec3f(0, 1, 0)));
        var xYZ = dotProdGrid_7(pos, (minJunction + vec3f(0, 1, 1)));
        var Xyz = dotProdGrid_7(pos, (minJunction + vec3f(1, 0, 0)));
        var XyZ = dotProdGrid_7(pos, (minJunction + vec3f(1, 0, 1)));
        var XYz = dotProdGrid_7(pos, (minJunction + vec3f(1, 1, 0)));
        var XYZ = dotProdGrid_7(pos, (minJunction + vec3f(1)));
        var partial = (pos - minJunction);
        var smoothPartial = quinticInterpolation3_11(partial);
        var xy = mix(xyz, xyZ, smoothPartial.z);
        var xY = mix(xYz, xYZ, smoothPartial.z);
        var Xy = mix(Xyz, XyZ, smoothPartial.z);
        var XY = mix(XYz, XYZ, smoothPartial.z);
        var x = mix(xy, xY, smoothPartial.y);
        var X = mix(Xy, XY, smoothPartial.y);
        return mix(x, X, smoothPartial.x);
      }

      fn item_12(n: f32, sharpness2: f32) -> f32 {
        return (sign(n) * pow(abs(n), (1 - sharpness2)));
      }

      @group(0) @binding(2) var<uniform> sharpness_13: f32;

      struct mainFragment_Input_14 {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment_3(input: mainFragment_Input_14) -> @location(0) vec4f {
        var uv = (gridSize_4 * input.uv);
        var n = sample_6(vec3f(uv, time_5));
        var sharp = item_12(n, sharpness_13);
        var n01 = ((sharp * 0.5) + 0.5);
        var dark = vec3f(0, 0.20000000298023224, 1);
        var light = vec3f(1, 0.30000001192092896, 0.5);
        return vec4f(mix(dark, light, n01), 1);
      }"
    `);
  });
});
