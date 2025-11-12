/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('caustics example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'caustics',
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct mainVertex_Output_1 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct mainVertex_Input_2 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertex_0(_arg_0: mainVertex_Input_2) -> mainVertex_Output_1 {
        var pos = array<vec2f, 3>(vec2f(0, 0.800000011920929), vec2f(-0.8, -0.8), vec2f(0.8f, -0.8));
        var uv = array<vec2f, 3>(vec2f(0.5, 1), vec2f(), vec2f(1, 0));
        return mainVertex_Output_1(vec4f(pos[_arg_0.vertexIndex], 0f, 1f), uv[_arg_0.vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> tileDensity_4: f32;

      fn tilePattern_5(uv: vec2f) -> f32 {
        var tiledUv = fract(uv);
        var proximity = abs(((tiledUv * 2) - 1));
        var maxProximity = max(proximity.x, proximity.y);
        return saturate((pow((1f - maxProximity), 0.6f) * 5f));
      }

      @group(0) @binding(1) var<uniform> time_6: f32;

      var<private> seed_13: vec2f;

      fn seed3_12(value: vec3f) {
        seed_13 = (value.xy + vec2f(value.z));
      }

      fn randSeed3_11(seed: vec3f) {
        seed3_12(seed);
      }

      fn item_15() -> f32 {
        var a = dot(seed_13, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_13, vec2f(54.47856521606445, 345.8415222167969));
        seed_13.x = fract((cos(a) * 136.8168f));
        seed_13.y = fract((cos(b) * 534.7645f));
        return seed_13.y;
      }

      fn randOnUnitSphere_14() -> vec3f {
        var z = ((2f * item_15()) - 1f);
        var oneMinusZSq = sqrt((1f - (z * z)));
        var theta = (6.283185307179586f * item_15());
        var x = (cos(theta) * oneMinusZSq);
        var y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      fn computeJunctionGradient_10(pos: vec3i) -> vec3f {
        randSeed3_11((1e-3 * vec3f(pos)));
        return randOnUnitSphere_14();
      }

      fn dotProdGrid_9(pos: vec3f, junction: vec3f) -> f32 {
        var relative = (pos - junction);
        var gridVector = computeJunctionGradient_10(vec3i(junction));
        return dot(relative, gridVector);
      }

      fn quinticInterpolationImpl_16(t: vec3f) -> vec3f {
        return ((t * (t * t)) * ((t * ((t * 6) - 15)) + 10));
      }

      fn sample_8(pos: vec3f) -> f32 {
        var minJunction = floor(pos);
        var xyz = dotProdGrid_9(pos, minJunction);
        var xyZ = dotProdGrid_9(pos, (minJunction + vec3f(0, 0, 1)));
        var xYz = dotProdGrid_9(pos, (minJunction + vec3f(0, 1, 0)));
        var xYZ = dotProdGrid_9(pos, (minJunction + vec3f(0, 1, 1)));
        var Xyz = dotProdGrid_9(pos, (minJunction + vec3f(1, 0, 0)));
        var XyZ = dotProdGrid_9(pos, (minJunction + vec3f(1, 0, 1)));
        var XYz = dotProdGrid_9(pos, (minJunction + vec3f(1, 1, 0)));
        var XYZ = dotProdGrid_9(pos, (minJunction + vec3f(1)));
        var partial = (pos - minJunction);
        var smoothPartial = quinticInterpolationImpl_16(partial);
        var xy = mix(xyz, xyZ, smoothPartial.z);
        var xY = mix(xYz, xYZ, smoothPartial.z);
        var Xy = mix(Xyz, XyZ, smoothPartial.z);
        var XY = mix(XYz, XYZ, smoothPartial.z);
        var x = mix(xy, xY, smoothPartial.y);
        var X = mix(Xy, XY, smoothPartial.y);
        return mix(x, X, smoothPartial.x);
      }

      fn caustics_7(uv: vec2f, time2: f32, profile: vec3f) -> vec3f {
        var distortion = sample_8(vec3f((uv * 0.5), (time2 * 0.2f)));
        var uv2 = (uv + distortion);
        var noise = abs(sample_8(vec3f((uv2 * 5), time2)));
        return pow(vec3f((1f - noise)), profile);
      }

      fn rotateXY_17(angle2: f32) -> mat2x2f {
        return mat2x2f(vec2f(cos(angle2), sin(angle2)), vec2f(-sin(angle2), cos(angle2)));
      }

      struct mainFragment_Input_18 {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment_3(_arg_0: mainFragment_Input_18) -> @location(0) vec4f {
        var skewMat = mat2x2f(vec2f(0.9800665974617004, 0.19866932928562164), vec2f(((-0.19866933079506122 * 10.) + (_arg_0.uv.x * 3f)), 4.900332889206208f));
        var skewedUv = (skewMat * _arg_0.uv);
        var tile = tilePattern_5((skewedUv * tileDensity_4));
        var albedo = mix(vec3f(0.10000000149011612), vec3f(1), tile);
        var cuv = vec2f(((_arg_0.uv.x * (pow((_arg_0.uv.y * 1.5f), 3f) + 0.1f)) * 5f), (pow((((_arg_0.uv.y * 1.5f) + 0.1f) * 1.5f), 3f) * 1f));
        var c1 = (caustics_7(cuv, (time_6 * 0.2f), vec3f(4, 4, 1)) * vec3f(0.4000000059604645, 0.6499999761581421, 1));
        var c2 = (caustics_7((cuv * 2), (time_6 * 0.4f), vec3f(16, 1, 4)) * vec3f(0.18000000715255737, 0.30000001192092896, 0.5));
        var blendCoord = vec3f((_arg_0.uv * vec2f(5, 10)), ((time_6 * 0.2f) + 5f));
        var blend = saturate((sample_8(blendCoord) + 0.3f));
        var noFogColor = (albedo * mix(vec3f(0.20000000298023224, 0.5, 1), (c1 + c2), blend));
        var fog = min((pow(_arg_0.uv.y, 0.5f) * 1.2f), 1f);
        var godRayUv = ((rotateXY_17(-0.3) * _arg_0.uv) * vec2f(15, 3));
        var godRayFactor = pow(_arg_0.uv.y, 1f);
        var godRay1 = ((sample_8(vec3f(godRayUv, (time_6 * 0.5f))) + 1f) * (vec3f(0.18000000715255737, 0.30000001192092896, 0.5) * godRayFactor));
        var godRay2 = ((sample_8(vec3f((godRayUv * 2), (time_6 * 0.3f))) + 1f) * (vec3f(0.18000000715255737, 0.30000001192092896, 0.5) * (godRayFactor * 0.4f)));
        var godRays = (godRay1 + godRay2);
        return vec4f((mix(noFogColor, vec3f(0.05000000074505806, 0.20000000298023224, 0.699999988079071), fog) + godRays), 1f);
      }"
    `);
  });
});
