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
      "struct vertexMain_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct vertexMain_Input {
        @builtin(vertex_index) idx: u32,
      }

      @vertex fn vertexMain(_arg_0: vertexMain_Input) -> vertexMain_Output {
        var pos = array<vec2f, 3>(vec2f(-1), vec2f(3, -1), vec2f(-1, 3));
        var uv = array<vec2f, 3>(vec2f(), vec2f(2, 0), vec2f(0, 2));
        return vertexMain_Output(vec4f(pos[_arg_0.idx], 0f, 1f), uv[_arg_0.idx]);
      }

      @group(0) @binding(0) var<uniform> resolution: vec2f;

      struct Shape {
        color: vec3f,
        dist: f32,
      }

      fn sdSphere(point: vec3f, radius: f32) -> f32 {
        return (length(point) - radius);
      }

      fn sdBoxFrame3d(point: vec3f, size: vec3f, thickness: f32) -> f32 {
        var p1 = (abs(point) - size);
        var q = (abs((p1 + thickness)) - vec3f(thickness));
        let d1 = (length(max(vec3f(p1.x, q.y, q.z), vec3f())) + min(max(p1.x, max(q.y, q.z)), 0f));
        let d2 = (length(max(vec3f(q.x, p1.y, q.z), vec3f())) + min(max(q.x, max(p1.y, q.z)), 0f));
        let d3 = (length(max(vec3f(q.x, q.y, p1.z), vec3f())) + min(max(q.x, max(q.y, p1.z)), 0f));
        return min(min(d1, d2), d3);
      }

      fn smoothShapeUnion(a: Shape, b: Shape, k: f32) -> Shape {
        let h = (max((k - abs((a.dist - b.dist))), 0f) / k);
        let m = (h * h);
        let dist = (min(a.dist, b.dist) - ((m * k) * 0.25f));
        let weight = (m + select(0f, (1f - m), (a.dist > b.dist)));
        var color = mix(a.color, b.color, weight);
        return Shape(color, dist);
      }

      fn getMorphingShape(p: vec3f, t: f32) -> Shape {
        var center = vec3f(0, 2, 6);
        var localP = (p - center);
        var rotMatZ = mat4x4f(cos(-(t)), sin(-(t)), 0, 0, -sin(-(t)), cos(-(t)), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
        var rotMatX = mat4x4f(1, 0, 0, 0, 0, cos((-(t) * 0.6f)), sin((-(t) * 0.6f)), 0, 0, -sin((-(t) * 0.6f)), cos((-(t) * 0.6f)), 0, 0, 0, 0, 1);
        var rotatedP = (rotMatZ * (rotMatX * vec4f(localP, 1f))).xyz;
        var boxSize = vec3f(0.699999988079071);
        var sphere1Offset = vec3f((cos((t * 2f)) * 0.8f), (sin((t * 3f)) * 0.3f), (sin((t * 2f)) * 0.8f));
        var sphere2Offset = vec3f((cos(((t * 2f) + 3.14f)) * 0.8f), (sin(((t * 3f) + 1.57f)) * 0.3f), (sin(((t * 2f) + 3.14f)) * 0.8f));
        var sphere1 = Shape(vec3f(0.4000000059604645, 0.5, 1), sdSphere((localP - sphere1Offset), 0.5f));
        var sphere2 = Shape(vec3f(1, 0.800000011920929, 0.20000000298023224), sdSphere((localP - sphere2Offset), 0.3f));
        var box = Shape(vec3f(1, 0.30000001192092896, 0.30000001192092896), sdBoxFrame3d(rotatedP, boxSize, 0.1f));
        var spheres = smoothShapeUnion(sphere1, sphere2, 0.1f);
        return smoothShapeUnion(spheres, box, 0.2f);
      }

      @group(0) @binding(1) var<uniform> time: f32;

      fn checkerBoard(uv: vec2f) -> f32 {
        var fuv = floor(uv);
        return (abs((fuv.x + fuv.y)) % 2f);
      }

      fn sdPlane(point: vec3f, normal: vec3f, height: f32) -> f32 {
        return (dot(point, normal) + height);
      }

      fn shapeUnion(a: Shape, b: Shape) -> Shape {
        return Shape(select(a.color, b.color, (a.dist > b.dist)), min(a.dist, b.dist));
      }

      fn getSceneDist(p: vec3f) -> Shape {
        var shape = getMorphingShape(p, time);
        var floor_1 = Shape(mix(vec3f(1), vec3f(0.20000000298023224), checkerBoard((p.xz * 2f))), sdPlane(p, vec3f(0, 1, 0), 0f));
        return shapeUnion(shape, floor_1);
      }

      fn rayMarch(ro: vec3f, rd: vec3f) -> Shape {
        var dO = 0f;
        var result = Shape(vec3f(), 30f);
        for (var i = 0; (i < 1000i); i++) {
          var p = (ro + (rd * dO));
          var scene = getSceneDist(p);
          dO += scene.dist;
          if (((dO > 30f) || (scene.dist < 1e-3f))) {
            result.dist = dO;
            result.color = scene.color;
            break;
          }
        }
        return result;
      }

      fn getNormal(p: vec3f) -> vec3f {
        let dist = getSceneDist(p).dist;
        const e = 0.01;
        var n = vec3f((getSceneDist((p + vec3f(e, 0f, 0f))).dist - dist), (getSceneDist((p + vec3f(0f, e, 0f))).dist - dist), (getSceneDist((p + vec3f(0f, 0f, e))).dist - dist));
        return normalize(n);
      }

      fn getOrbitingLightPos(t: f32) -> vec3f {
        const radius = 3f;
        const height = 6f;
        const speed = 1f;
        return vec3f((cos((t * speed)) * radius), (height + (sin((t * speed)) * radius)), 4f);
      }

      fn softShadow(ro: vec3f, rd: vec3f, minT: f32, maxT: f32, k: f32) -> f32 {
        var res = 1f;
        var t = minT;
        for (var i = 0; (i < 100i); i++) {
          if ((t >= maxT)) {
            break;
          }
          let h = getSceneDist((ro + (rd * t))).dist;
          if ((h < 1e-3f)) {
            return 0;
          }
          res = min(res, ((k * h) / t));
          t += max(h, 1e-3f);
        }
        return res;
      }

      struct fragmentMain_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentMain(input: fragmentMain_Input) -> @location(0) vec4f {
        var uv = ((input.uv * 2f) - 1f);
        uv.x *= (resolution.x / resolution.y);
        var ro = vec3f(0, 2, 3);
        var rd = normalize(vec3f(uv.x, uv.y, 1f));
        var march = rayMarch(ro, rd);
        let fog = pow(min((march.dist / 30f), 1f), 0.7f);
        var p = (ro + (rd * march.dist));
        var n = getNormal(p);
        var lightPos = getOrbitingLightPos(time);
        var l = normalize((lightPos - p));
        let diff = max(dot(n, l), 0f);
        let shadowRo = (&p);
        let shadowRd = (&l);
        let shadowDist = length((lightPos - p));
        let shadow = softShadow((*shadowRo), (*shadowRd), 0.1f, shadowDist, 16f);
        var litColor = (march.color * diff);
        var finalColor = mix((litColor * 0.5f), litColor, shadow);
        return mix(vec4f(finalColor, 1f), vec4f(0.699999988079071, 0.800000011920929, 0.8999999761581421, 1), fog);
      }"
    `);
  });
});
