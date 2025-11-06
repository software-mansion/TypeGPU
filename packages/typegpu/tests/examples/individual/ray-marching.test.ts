/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('ray-marching example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'ray-marching',
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct vertexMain_Output_1 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct vertexMain_Input_2 {
        @builtin(vertex_index) idx: u32,
      }

      @vertex fn vertexMain_0(_arg_0: vertexMain_Input_2) -> vertexMain_Output_1 {
        var pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3f, -1), vec2f(-1, 3f));
        var uv = array<vec2f, 3>(vec2f(), vec2f(2, 0), vec2f(0, 2));
        return vertexMain_Output_1(vec4f(pos[_arg_0.idx], 0f, 1f), uv[_arg_0.idx]);
      }

      @group(0) @binding(0) var<uniform> resolution_4: vec2f;

      struct Shape_6 {
        color: vec3f,
        dist: f32,
      }

      fn sdSphere_9(p: vec3f, radius: f32) -> f32 {
        return (length(p) - radius);
      }

      fn sdBoxFrame3d_10(p: vec3f, size: vec3f, thickness: f32) -> f32 {
        var p1 = (abs(p) - size);
        var q = (abs((p1 + thickness)) - vec3f(thickness));
        var d1 = (length(max(vec3f(p1.x, q.y, q.z), vec3f())) + min(max(p1.x, max(q.y, q.z)), 0f));
        var d2 = (length(max(vec3f(q.x, p1.y, q.z), vec3f())) + min(max(q.x, max(p1.y, q.z)), 0f));
        var d3 = (length(max(vec3f(q.x, q.y, p1.z), vec3f())) + min(max(q.x, max(q.y, p1.z)), 0f));
        return min(min(d1, d2), d3);
      }

      fn smoothShapeUnion_11(a: Shape_6, b: Shape_6, k: f32) -> Shape_6 {
        var h = (max((k - abs((a.dist - b.dist))), 0f) / k);
        var m = (h * h);
        var dist = (min(a.dist, b.dist) - ((m * k) * 0.25f));
        var weight = (m + select(0f, (1f - m), (a.dist > b.dist)));
        var color = mix(a.color, b.color, weight);
        return Shape_6(color, dist);
      }

      fn getMorphingShape_8(p: vec3f, t: f32) -> Shape_6 {
        var center = vec3f(0, 2, 6);
        var localP = (p - center);
        var rotMatZ = mat4x4f(cos(-t), sin(-t), 0, 0, -sin(-t), cos(-t), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
        var rotMatX = mat4x4f(1, 0, 0, 0, 0, cos((-t * 0.6f)), sin((-t * 0.6f)), 0, 0, -sin((-t * 0.6f)), cos((-t * 0.6f)), 0, 0, 0, 0, 1);
        var rotatedP = (rotMatZ * (rotMatX * vec4f(localP, 1f))).xyz;
        var boxSize = vec3f(0.699999988079071);
        var sphere1Offset = vec3f((cos((t * 2f)) * 0.8f), (sin((t * 3f)) * 0.3f), (sin((t * 2f)) * 0.8f));
        var sphere2Offset = vec3f((cos(((t * 2f) + 3.14f)) * 0.8f), (sin(((t * 3f) + 1.57f)) * 0.3f), (sin(((t * 2f) + 3.14f)) * 0.8f));
        var sphere1 = Shape_6(vec3f(0.4000000059604645, 0.5, 1), sdSphere_9((localP - sphere1Offset), 0.5f));
        var sphere2 = Shape_6(vec3f(1, 0.800000011920929, 0.20000000298023224), sdSphere_9((localP - sphere2Offset), 0.3f));
        var box = Shape_6(vec3f(1, 0.30000001192092896, 0.30000001192092896), sdBoxFrame3d_10(rotatedP, boxSize, 0.1f));
        var spheres = smoothShapeUnion_11(sphere1, sphere2, 0.1);
        return smoothShapeUnion_11(spheres, box, 0.2);
      }

      @group(0) @binding(1) var<uniform> time_12: f32;

      fn checkerBoard_13(uv: vec2f) -> f32 {
        var fuv = floor(uv);
        return (abs((fuv.x + fuv.y)) % 2f);
      }

      fn sdPlane_14(p: vec3f, n: vec3f, h: f32) -> f32 {
        return (dot(p, n) + h);
      }

      fn shapeUnion_15(a: Shape_6, b: Shape_6) -> Shape_6 {
        return Shape_6(select(a.color, b.color, (a.dist > b.dist)), min(a.dist, b.dist));
      }

      fn getSceneDist_7(p: vec3f) -> Shape_6 {
        var shape = getMorphingShape_8(p, time_12);
        var floor = Shape_6(mix(vec3f(1), vec3f(0.20000000298023224), checkerBoard_13((p.xz * 2))), sdPlane_14(p, vec3f(0, 1, 0), 0f));
        return shapeUnion_15(shape, floor);
      }

      fn rayMarch_5(ro: vec3f, rd: vec3f) -> Shape_6 {
        var dO = 0f;
        var result = Shape_6(vec3f(), 30f);
        for (var i = 0; (i < 1000i); i++) {
          var p = (ro + (rd * dO));
          var scene = getSceneDist_7(p);
          dO += scene.dist;
          if (((dO > 30f) || (scene.dist < 1e-3f))) {
            result.dist = dO;
            result.color = scene.color;
            break;
          }
        }
        return result;
      }

      fn getNormal_16(p: vec3f) -> vec3f {
        var dist = getSceneDist_7(p).dist;
        var e = 0.01;
        var n = vec3f((getSceneDist_7((p + vec3f(e, 0f, 0f))).dist - dist), (getSceneDist_7((p + vec3f(0f, e, 0f))).dist - dist), (getSceneDist_7((p + vec3f(0f, 0f, e))).dist - dist));
        return normalize(n);
      }

      fn getOrbitingLightPos_17(t: f32) -> vec3f {
        var radius = 3f;
        var height = 6f;
        var speed = 1f;
        return vec3f((cos((t * speed)) * radius), (height + (sin((t * speed)) * radius)), 4f);
      }

      fn softShadow_18(ro: vec3f, rd: vec3f, minT: f32, maxT: f32, k: f32) -> f32 {
        var res = 1f;
        var t = minT;
        for (var i = 0; (i < 100i); i++) {
          if ((t >= maxT)) {
            break;
          }
          var h = getSceneDist_7((ro + (rd * t))).dist;
          if ((h < 1e-3f)) {
            return 0;
          }
          res = min(res, ((k * h) / t));
          t += max(h, 1e-3f);
        }
        return res;
      }

      struct fragmentMain_Input_19 {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentMain_3(input: fragmentMain_Input_19) -> @location(0) vec4f {
        var uv = ((input.uv * 2) - 1);
        uv.x *= (resolution_4.x / resolution_4.y);
        var ro = vec3f(0, 2, 3);
        var rd = normalize(vec3f(uv.x, uv.y, 1f));
        var march = rayMarch_5(ro, rd);
        var fog = pow(min((march.dist / 30f), 1f), 0.7f);
        var p = (ro + (rd * march.dist));
        var n = getNormal_16(p);
        var lightPos = getOrbitingLightPos_17(time_12);
        var l = normalize((lightPos - p));
        var diff = max(dot(n, l), 0f);
        var shadowRo = p;
        var shadowRd = l;
        var shadowDist = length((lightPos - p));
        var shadow = softShadow_18(shadowRo, shadowRd, 0.1, shadowDist, 16f);
        var litColor = (march.color * diff);
        var finalColor = mix((litColor * 0.5), litColor, shadow);
        return mix(vec4f(finalColor, 1f), vec4f(0.699999988079071, 0.800000011920929, 0.8999999761581421, 1), fog);
      }"
    `);
  });
});
