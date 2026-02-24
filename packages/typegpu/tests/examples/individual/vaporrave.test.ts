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
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> memoryBuffer: array<vec3f, 343>;

      var<private> seed: vec2f;

      fn seed3(value: vec3f) {
        seed = (value.xy + vec2f(value.z));
      }

      fn randSeed3(seed: vec3f) {
        {
          seed3(seed);
        }
      }

      fn sample() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randOnUnitSphere() -> vec3f {
        let z = ((2f * sample()) - 1f);
        let oneMinusZSq = sqrt((1f - (z * z)));
        let theta = (6.283185307179586f * sample());
        let x = (cos(theta) * oneMinusZSq);
        let y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      fn computeJunctionGradient(pos: vec3i) -> vec3f {
        randSeed3((1e-3f * vec3f(pos)));
        return randOnUnitSphere();
      }

      fn wrappedCallback(x: u32, y: u32, z: u32) {
        let idx = ((x + (y * 7u)) + ((z * 7u) * 7u));
        memoryBuffer[idx] = computeJunctionGradient(vec3i(i32(x), i32(y), i32(z)));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(8, 8, 4) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      struct vertexMain_Output {
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

      @group(0) @binding(0) var<uniform> resolutionUniform: vec2f;

      struct Ray {
        color: vec3f,
        dist: f32,
      }

      fn rotateXY(angle: f32) -> mat2x2f {
        return mat2x2f(vec2f(cos(angle), sin(angle)), vec2f(-(sin(angle)), cos(angle)));
      }

      fn circles(uv: vec2f, angle: f32) -> vec3f {
        var uvRotated = (rotateXY(angle) * vec2f(uv.x, (uv.y - 12f)));
        var uvNormalized = fract((vec2f(uvRotated.x, uvRotated.y) / 1.2f));
        var diff2 = pow((vec2f(0.5) - uvNormalized), vec2f(2));
        let distO = pow((diff2.x + diff2.y), 0.5f);
        return mix(vec3f(), vec3f(0.9200000166893005, 0.20999999344348907, 0.9599999785423279), exp((-5f * distO)));
      }

      @group(0) @binding(1) var<uniform> floorAngleUniform: f32;

      fn sdPlane(point: vec3f, normal: vec3f, height: f32) -> f32 {
        return (dot(point, normal) + height);
      }

      fn rotateAroundZ(angle: f32) -> mat3x3f {
        return mat3x3f(vec3f(cos(angle), sin(angle), 0f), vec3f(-(sin(angle)), cos(angle), 0f), vec3f(0, 0, 1));
      }

      fn rotateAroundX(angle: f32) -> mat3x3f {
        return mat3x3f(vec3f(1, 0, 0), vec3f(0f, cos(angle), sin(angle)), vec3f(0f, -(sin(angle)), cos(angle)));
      }

      fn sdSphere(point: vec3f, radius: f32) -> f32 {
        return (length(point) - radius);
      }

      @group(0) @binding(2) var<storage, read> memoryBuffer: array<vec3f, 343>;

      fn getJunctionGradient(pos: vec3i) -> vec3f {
        var size_i = vec3i(7);
        let x = (((pos.x % size_i.x) + size_i.x) % size_i.x);
        let y = (((pos.y % size_i.y) + size_i.y) % size_i.y);
        let z = (((pos.z % size_i.z) + size_i.z) % size_i.z);
        return memoryBuffer[((x + (y * size_i.x)) + ((z * size_i.x) * size_i.y))];
      }

      fn dotProdGrid(pos: vec3f, junction: vec3f) -> f32 {
        var relative = (pos - junction);
        var gridVector = getJunctionGradient(vec3i(junction));
        return dot(relative, gridVector);
      }

      fn quinticInterpolationImpl(t: vec3f) -> vec3f {
        return ((t * (t * t)) * ((t * ((t * 6f) - 15f)) + 10f));
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
        var smoothPartial = quinticInterpolationImpl(partial);
        let xy = mix(xyz, xyZ, smoothPartial.z);
        let xY = mix(xYz, xYZ, smoothPartial.z);
        let Xy = mix(Xyz, XyZ, smoothPartial.z);
        let XY = mix(XYz, XYZ, smoothPartial.z);
        let x = mix(xy, xY, smoothPartial.y);
        let X = mix(Xy, XY, smoothPartial.y);
        return mix(x, X, smoothPartial.x);
      }

      fn getSphere(p: vec3f, sphereColor: vec3f, sphereCenter: vec3f, angle: f32) -> Ray {
        var localP = (p - sphereCenter);
        var rotMatZ = rotateAroundZ((-(angle) * 0.3f));
        var rotMatX = rotateAroundX((-(angle) * 0.7f));
        var rotatedP = ((localP * rotMatZ) * rotMatX);
        let radius = (3f + sin(angle));
        let rawDist = sdSphere(rotatedP, radius);
        var noise = 0f;
        if ((rawDist < 1f)) {
          noise += sample((rotatedP + angle));
        }
        return Ray(sphereColor, (rawDist + noise));
      }

      @group(0) @binding(3) var<uniform> sphereColorUniform: vec3f;

      @group(0) @binding(4) var<uniform> sphereAngleUniform: f32;

      fn rayUnion(a: Ray, b: Ray) -> Ray {
        return Ray(select(a.color, b.color, (a.dist > b.dist)), min(a.dist, b.dist));
      }

      fn getSceneRay(p: vec3f) -> Ray {
        var floor_1 = Ray(circles(p.xz, floorAngleUniform), sdPlane(p, vec3f(0, 1, 0), 1f));
        var sphere = getSphere(p, sphereColorUniform, vec3f(0, 6, 12), sphereAngleUniform);
        return rayUnion(floor_1, sphere);
      }

      struct LightRay {
        ray: Ray,
        glow: vec3f,
      }

      fn rayMarch(ro: vec3f, rd: vec3f) -> LightRay {
        var distOrigin = 0f;
        var result = Ray(vec3f(), 19f);
        var glow = vec3f();
        for (var i = 0; (i < 1000i); i++) {
          var p = ((rd * distOrigin) + ro);
          var scene = getSceneRay(p);
          var sphereDist = getSphere(p, sphereColorUniform, vec3f(0, 6, 12), sphereAngleUniform);
          glow = ((sphereColorUniform * exp(-(sphereDist.dist))) + glow);
          distOrigin += scene.dist;
          if ((distOrigin > 19f)) {
            result.dist = 19f;
            break;
          }
          if ((scene.dist < 1e-3f)) {
            result.dist = distOrigin;
            result.color = scene.color;
            break;
          }
        }
        return LightRay(result, glow);
      }

      @group(0) @binding(5) var<uniform> glowIntensityUniform: f32;

      struct fragmentMain_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentMain(input: fragmentMain_Input) -> @location(0) vec4f {
        var uv = ((input.uv * 2f) - 1f);
        uv.x *= (resolutionUniform.x / resolutionUniform.y);
        var ro = vec3f(0, 2, -1);
        var rd = normalize(vec3f(uv.x, uv.y, 1f));
        var march = rayMarch(ro, rd);
        let y = (((rd * march.ray.dist) + ro).y - 2f);
        var sky = mix(vec4f(0.10000000149011612, 0, 0.20000000298023224, 1), vec4f(0.2800000011920929, 0, 0.5400000214576721, 1), (y / 19f));
        let fog = min((march.ray.dist / 19f), 1f);
        return mix(mix(vec4f(march.ray.color, 1f), sky, fog), vec4f(march.glow, 1f), glowIntensityUniform);
      }"
    `);
  });
});
