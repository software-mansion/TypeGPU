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
      "struct mainVertex_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct mainVertex_Input {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertex(_arg_0: mainVertex_Input) -> mainVertex_Output {
        var pos = array<vec2f, 3>(vec2f(0, 0.800000011920929), vec2f(-0.800000011920929), vec2f(0.800000011920929, -0.800000011920929));
        var uv = array<vec2f, 3>(vec2f(0.5, 1), vec2f(), vec2f(1, 0));
        return mainVertex_Output(vec4f(pos[_arg_0.vertexIndex], 0f, 1f), uv[_arg_0.vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> tileDensity: f32;

      fn tilePattern(uv: vec2f) -> f32 {
        var tiledUv = fract(uv);
        var proximity = abs(((tiledUv * 2f) - 1f));
        let maxProximity = max(proximity.x, proximity.y);
        return saturate((pow((1f - maxProximity), 0.6f) * 5f));
      }

      @group(0) @binding(1) var<uniform> time: f32;

      var<private> seed: vec2f;

      fn seed3(value: vec3f) {
        seed = (value.xy + vec2f(value.z));
      }

      fn randSeed3(seed: vec3f) {
        seed3(seed);
      }

      fn sample_1() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
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
        var relative = (pos - junction);
        var gridVector = computeJunctionGradient(vec3i(junction));
        return dot(relative, gridVector);
      }

      fn quinticInterpolation(t: vec3f) -> vec3f {
        return (((t * t) * t) * ((t * ((t * 6f) - 15f)) + 10f));
      }

      fn sample(pos: vec3f) -> f32 {
        var minJunction = floor(pos);
        let xyz = dotProdGrid(pos, minJunction);
        let xyZ = dotProdGrid(pos, (minJunction + vec3f(0, 0, 1)));
        let xYz = dotProdGrid(pos, (minJunction + vec3f(0, 1, 0)));
        let xYZ = dotProdGrid(pos, (minJunction + vec3f(0, 1, 1)));
        let Xyz = dotProdGrid(pos, (minJunction + vec3f(1, 0, 0)));
        let XyZ = dotProdGrid(pos, (minJunction + vec3f(1, 0, 1)));
        let XYz = dotProdGrid(pos, (minJunction + vec3f(1, 1, 0)));
        let XYZ = dotProdGrid(pos, (minJunction + vec3f(1)));
        var partial = (pos - minJunction);
        var smoothPartial = quinticInterpolation(partial);
        let xy = mix(xyz, xyZ, smoothPartial.z);
        let xY = mix(xYz, xYZ, smoothPartial.z);
        let Xy = mix(Xyz, XyZ, smoothPartial.z);
        let XY = mix(XYz, XYZ, smoothPartial.z);
        let x = mix(xy, xY, smoothPartial.y);
        let X = mix(Xy, XY, smoothPartial.y);
        return mix(x, X, smoothPartial.x);
      }

      fn caustics(uv: vec2f, time2: f32, profile: vec3f) -> vec3f {
        let distortion = sample(vec3f((uv * 0.5f), (time2 * 0.2f)));
        var uv2 = (uv + distortion);
        let noise = abs(sample(vec3f((uv2 * 5f), time2)));
        return pow(vec3f((1f - noise)), profile);
      }

      fn rotateXY(angle2: f32) -> mat2x2f {
        return mat2x2f(vec2f(cos(angle2), sin(angle2)), vec2f(-(sin(angle2)), cos(angle2)));
      }

      struct mainFragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment(_arg_0: mainFragment_Input) -> @location(0) vec4f {
        var skewMat = mat2x2f(vec2f(0.9800665974617004, 0.19866932928562164), vec2f((-1.9866933079506122f + (_arg_0.uv.x * 3f)), 4.900332889206208f));
        var skewedUv = (skewMat * _arg_0.uv);
        let tile = tilePattern((skewedUv * tileDensity));
        var albedo = mix(vec3f(0.10000000149011612), vec3f(1), tile);
        var cuv = vec2f(((_arg_0.uv.x * (pow((_arg_0.uv.y * 1.5f), 3f) + 0.1f)) * 5f), (pow((((_arg_0.uv.y * 1.5f) + 0.1f) * 1.5f), 3f) * 1f));
        var c1 = (caustics(cuv, (time * 0.2f), vec3f(4, 4, 1)) * vec3f(0.4000000059604645, 0.6499999761581421, 1));
        var c2 = (caustics((cuv * 2f), (time * 0.4f), vec3f(16, 1, 4)) * vec3f(0.18000000715255737, 0.30000001192092896, 0.5));
        var blendCoord = vec3f((_arg_0.uv * vec2f(5, 10)), ((time * 0.2f) + 5f));
        let blend = saturate((sample(blendCoord) + 0.3f));
        var noFogColor = (albedo * mix(vec3f(0.20000000298023224, 0.5, 1), (c1 + c2), blend));
        let fog = min((pow(_arg_0.uv.y, 0.5f) * 1.2f), 1f);
        var godRayUv = ((rotateXY(-0.3f) * _arg_0.uv) * vec2f(15, 3));
        let godRayFactor = pow(_arg_0.uv.y, 1f);
        var godRay1 = ((sample(vec3f(godRayUv, (time * 0.5f))) + 1f) * (vec3f(0.18000000715255737, 0.30000001192092896, 0.5) * godRayFactor));
        var godRay2 = ((sample(vec3f((godRayUv * 2f), (time * 0.3f))) + 1f) * (vec3f(0.18000000715255737, 0.30000001192092896, 0.5) * (godRayFactor * 0.4f)));
        var godRays = (godRay1 + godRay2);
        return vec4f((mix(noFogColor, vec3f(0.05000000074505806, 0.20000000298023224, 0.699999988079071), fog) + godRays), 1f);
      }"
    `);
  });
});
