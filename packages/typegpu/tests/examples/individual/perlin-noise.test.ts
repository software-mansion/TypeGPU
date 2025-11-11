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
      "@group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      @group(1) @binding(0) var<uniform> size_3: vec4u;

      @group(1) @binding(1) var<storage, read_write> memory_4: array<vec3f>;

      var<private> seed_8: vec2f;

      fn seed3_7(value: vec3f) {
        seed_8 = (value.xy + vec2f(value.z));
      }

      fn randSeed3_6(seed: vec3f) {
        seed3_7(seed);
      }

      fn item_10() -> f32 {
        var a = dot(seed_8, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_8, vec2f(54.47856521606445, 345.8415222167969));
        seed_8.x = fract((cos(a) * 136.8168f));
        seed_8.y = fract((cos(b) * 534.7645f));
        return seed_8.y;
      }

      fn randOnUnitSphere_9() -> vec3f {
        var z = ((2f * item_10()) - 1f);
        var oneMinusZSq = sqrt((1f - (z * z)));
        var theta = (6.283185307179586f * item_10());
        var x = (cos(theta) * oneMinusZSq);
        var y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      fn computeJunctionGradient_5(pos: vec3i) -> vec3f {
        randSeed3_6((1e-3 * vec3f(pos)));
        return randOnUnitSphere_9();
      }

      fn mainCompute_2(x: u32, y: u32, z: u32) {
        var size = size_3;
        var idx = ((x + (y * size.x)) + ((z * size.x) * size.y));
        memory_4[idx] = computeJunctionGradient_5(vec3i(i32(x), i32(y), i32(z)));
      }

      struct mainCompute_Input_11 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(8, 8, 4) fn mainCompute_0(in: mainCompute_Input_11)  {
        if (any(in.id >= sizeUniform_1)) {
          return;
        }
        mainCompute_2(in.id.x, in.id.y, in.id.z);
      }

      struct fullScreenTriangle_Input_1 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct fullScreenTriangle_Output_2 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle_0(in: fullScreenTriangle_Input_1) -> fullScreenTriangle_Output_2 {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output_2(vec4f(pos[in.vertexIndex], 0, 1), uv[in.vertexIndex]);
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

      fn quinticInterpolationImpl_11(t: vec3f) -> vec3f {
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
        var smoothPartial = quinticInterpolationImpl_11(partial);
        var xy = mix(xyz, xyZ, smoothPartial.z);
        var xY = mix(xYz, xYZ, smoothPartial.z);
        var Xy = mix(Xyz, XyZ, smoothPartial.z);
        var XY = mix(XYz, XYZ, smoothPartial.z);
        var x = mix(xy, xY, smoothPartial.y);
        var X = mix(Xy, XY, smoothPartial.y);
        return mix(x, X, smoothPartial.x);
      }

      fn exponentialSharpen_12(n: f32, sharpness2: f32) -> f32 {
        return (sign(n) * pow(abs(n), (1f - sharpness2)));
      }

      @group(0) @binding(2) var<uniform> sharpness_13: f32;

      struct mainFragment_Input_14 {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment_3(input: mainFragment_Input_14) -> @location(0) vec4f {
        var uv = (gridSize_4 * input.uv);
        var n = sample_6(vec3f(uv, time_5));
        var sharp = exponentialSharpen_12(n, sharpness_13);
        var n01 = ((sharp * 0.5f) + 0.5f);
        var dark = vec3f(0, 0.20000000298023224, 1);
        var light = vec3f(1, 0.30000001192092896, 0.5);
        return vec4f(mix(dark, light, n01), 1f);
      }"
    `);
  });
});
