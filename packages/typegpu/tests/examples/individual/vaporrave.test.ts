/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('vaporrave example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simple',
      name: 'vaporrave',
      expectedCalls: 2,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct mainCompute_Input_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(0) var<storage, read_write> memoryBuffer_2: array<vec3f, 343>;

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
        var theta = ((6.283185307179586 * item_8()) - 3.141592653589793);
        var x = (sin(theta) * oneMinusZSq);
        var y = (cos(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      fn computeJunctionGradient_3(pos: vec3i) -> vec3f {
        randSeed3_4((1e-3 * vec3f(pos)));
        return randOnUnitSphere_7();
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(input: mainCompute_Input_1) {
        var idx = ((input.gid.x + (input.gid.y * 7)) + ((input.gid.z * 7) * 7));
        memoryBuffer_2[idx] = computeJunctionGradient_3(vec3i(input.gid.xyz));
      }

      struct vertexMain_Input_1 {
        @builtin(vertex_index) idx: u32,
      }

      struct vertexMain_Output_2 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn vertexMain_0(_arg_0: vertexMain_Input_1) -> vertexMain_Output_2 {
        var pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        var uv = array<vec2f, 3>(vec2f(), vec2f(2, 0), vec2f(0, 2));
        return vertexMain_Output_2(vec4f(pos[_arg_0.idx], 0, 1), uv[_arg_0.idx]);
      }

      struct fragmentMain_Input_4 {
        @location(0) uv: vec2f,
      }

      @group(0) @binding(0) var<uniform> resolutionUniform_5: vec2f;

      struct Ray_8 {
        color: vec3f,
        dist: f32,
      }

      struct LightRay_7 {
        ray: Ray_8,
        glow: vec3f,
      }

      fn rotateXY_11(angle: f32) -> mat2x2f {
        return mat2x2f(vec2f(cos(angle), sin(angle)), vec2f(-sin(angle), cos(angle)));
      }

      fn circles_10(uv: vec2f, angle: f32) -> vec3f {
        var uvRotated = (rotateXY_11(angle) * vec2f(uv.x, (uv.y - 12)));
        var uvNormalized = fract((vec2f(uvRotated.x, uvRotated.y) / 1.2));
        var diff2 = pow((vec2f(0.5) - uvNormalized), vec2f(2));
        var distO = pow((diff2.x + diff2.y), 0.5);
        return mix(vec3f(), vec3f(0.9200000166893005, 0.20999999344348907, 0.9599999785423279), exp((-5 * distO)));
      }

      @group(0) @binding(1) var<uniform> floorAngleUniform_12: f32;

      fn sdPlane_13(p: vec3f, n: vec3f, h: f32) -> f32 {
        return (dot(p, n) + h);
      }

      fn rotateAroundZ_15(angle: f32) -> mat3x3f {
        return mat3x3f(vec3f(cos(angle), sin(angle), 0), vec3f(-sin(angle), cos(angle), 0), vec3f(0, 0, 1));
      }

      fn rotateAroundX_16(angle: f32) -> mat3x3f {
        return mat3x3f(vec3f(1, 0, 0), vec3f(0, cos(angle), sin(angle)), vec3f(0, -sin(angle), cos(angle)));
      }

      fn sdSphere_17(p: vec3f, radius: f32) -> f32 {
        return (length(p) - radius);
      }

      @group(0) @binding(2) var<storage, read> memoryBuffer_21: array<vec3f, 343>;

      fn getJunctionGradient_20(pos: vec3i) -> vec3f {
        var size_i = vec3i(7);
        var x = (((pos.x % size_i.x) + size_i.x) % size_i.x);
        var y = (((pos.y % size_i.y) + size_i.y) % size_i.y);
        var z = (((pos.z % size_i.z) + size_i.z) % size_i.z);
        return memoryBuffer_21[((x + (y * size_i.x)) + ((z * size_i.x) * size_i.y))];
      }

      fn dotProdGrid_19(pos: vec3f, junction: vec3f) -> f32 {
        var relative = (pos - junction);
        var gridVector = getJunctionGradient_20(vec3i(junction));
        return dot(relative, gridVector);
      }

      fn quinticInterpolation3_22(t: vec3f) -> vec3f {
        return ((t * (t * t)) * ((t * ((t * 6) - 15)) + 10));
      }

      fn sample_18(pos: vec3f) -> f32 {
        var minJunction = floor(pos);
        var xyz = dotProdGrid_19(pos, minJunction);
        var xyZ = dotProdGrid_19(pos, (minJunction + vec3f(0, 0, 1)));
        var xYz = dotProdGrid_19(pos, (minJunction + vec3f(0, 1, 0)));
        var xYZ = dotProdGrid_19(pos, (minJunction + vec3f(0, 1, 1)));
        var Xyz = dotProdGrid_19(pos, (minJunction + vec3f(1, 0, 0)));
        var XyZ = dotProdGrid_19(pos, (minJunction + vec3f(1, 0, 1)));
        var XYz = dotProdGrid_19(pos, (minJunction + vec3f(1, 1, 0)));
        var XYZ = dotProdGrid_19(pos, (minJunction + vec3f(1)));
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

      fn getSphere_14(p: vec3f, sphereColor: vec3f, sphereCenter: vec3f, angle: f32) -> Ray_8 {
        var localP = (p - sphereCenter);
        var rotMatZ = rotateAroundZ_15((-angle * 0.3));
        var rotMatX = rotateAroundX_16((-angle * 0.7));
        var rotatedP = ((localP * rotMatZ) * rotMatX);
        var radius = (3 + sin(angle));
        var rawDist = sdSphere_17(rotatedP, radius);
        var noise = 0f;
        if ((rawDist < 1)) {
          noise += sample_18((rotatedP + angle));
        }
        return Ray_8(sphereColor, (rawDist + noise));
      }

      @group(0) @binding(3) var<uniform> sphereColorUniform_23: vec3f;

      @group(0) @binding(4) var<uniform> sphereAngleUniform_24: f32;

      fn rayUnion_25(a: Ray_8, b: Ray_8) -> Ray_8 {
        return Ray_8(select(a.color, b.color, (a.dist > b.dist)), min(a.dist, b.dist));
      }

      fn getSceneRay_9(p: vec3f) -> Ray_8 {
        var floor = Ray_8(circles_10(p.xz, floorAngleUniform_12), sdPlane_13(p, vec3f(0, 1, 0), 1));
        var sphere = getSphere_14(p, sphereColorUniform_23, vec3f(0, 6, 12), sphereAngleUniform_24);
        return rayUnion_25(floor, sphere);
      }

      fn rayMarch_6(ro: vec3f, rd: vec3f) -> LightRay_7 {
        var distOrigin = 0f;
        var result = Ray_8(vec3f(), 19);
        var glow = vec3f();
        for (var i = 0; (i < 1000); i++) {
          var p = ((rd * distOrigin) + ro);
          var scene = getSceneRay_9(p);
          var sphereDist = getSphere_14(p, sphereColorUniform_23, vec3f(0, 6, 12), sphereAngleUniform_24);
          glow = ((vec3f(sphereColorUniform_23) * exp(-sphereDist.dist)) + glow);
          distOrigin += scene.dist;
          if ((distOrigin > 19)) {
            result.dist = 19;
            break;
          }
          if ((scene.dist < 1e-3)) {
            result.dist = distOrigin;
            result.color = scene.color;
            break;
          }
        }
        return LightRay_7(result, glow);
      }

      @group(0) @binding(5) var<uniform> glowIntensityUniform_26: f32;

      @fragment fn fragmentMain_3(input: fragmentMain_Input_4) -> @location(0) vec4f {
        var uv = ((input.uv * 2) - 1);
        uv.x *= (resolutionUniform_5.x / resolutionUniform_5.y);
        var ro = vec3f(0, 2, -1);
        var rd = normalize(vec3f(uv.x, uv.y, 1));
        var march = rayMarch_6(ro, rd);
        var y = (((rd * march.ray.dist) + ro).y - 2);
        var sky = mix(vec4f(0.10000000149011612, 0, 0.20000000298023224, 1), vec4f(0.2800000011920929, 0, 0.5400000214576721, 1), (y / 19f));
        var fog = min((march.ray.dist / 19f), 1);
        return mix(mix(vec4f(march.ray.color, 1), sky, fog), vec4f(march.glow, 1), glowIntensityUniform_26);
      }"
    `);
  });
});
