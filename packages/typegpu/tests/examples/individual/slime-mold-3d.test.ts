/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('slime mold 3d example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simulation',
      name: 'slime-mold-3d',
      expectedCalls: 4,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      var<private> seed_5: vec2f;

      fn seed_4(value: f32) {
        seed_5 = vec2f(value, 0f);
      }

      fn randSeed_3(seed: f32) {
        seed_4(seed);
      }

      fn item_7() -> f32 {
        var a = dot(seed_5, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_5, vec2f(54.47856521606445, 345.8415222167969));
        seed_5.x = fract((cos(a) * 136.8168f));
        seed_5.y = fract((cos(b) * 534.7645f));
        return seed_5.y;
      }

      fn randUniformExclusive_9() -> f32 {
        return ((item_7() * 0.9999998f) + 1e-7f);
      }

      fn randNormal_8(mu: f32, sigma: f32) -> f32 {
        var theta = (6.283185307179586f * randUniformExclusive_9());
        var R = sqrt((-2 * log(randUniformExclusive_9())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn randInUnitSphere_6() -> vec3f {
        var u = item_7();
        var v = vec3f(randNormal_8(0f, 1f), randNormal_8(0f, 1f), randNormal_8(0f, 1f));
        var vNorm = normalize(v);
        return (vNorm * pow(u, 0.33f));
      }

      struct Agent_11 {
        position: vec3f,
        direction: vec3f,
      }

      @group(0) @binding(1) var<storage, read_write> item_10: array<Agent_11, 800000>;

      @group(0) @binding(2) var<storage, read_write> item_12: array<Agent_11, 800000>;

      fn wrappedCallback_2(x: u32, _arg_1: u32, _arg_2: u32) {
        randSeed_3((f32(x) / 8e+5f));
        var pos = ((randInUnitSphere_6() * 64.) + vec3f(128));
        var center = vec3f(128);
        var dir = normalize((center - pos));
        item_10[x] = Agent_11(pos, dir);
        item_12[x] = Agent_11(pos, dir);
      }

      struct mainCompute_Input_13 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute_0(in: mainCompute_Input_13)  {
        if (any(in.id >= sizeUniform_1)) {
          return;
        }
        wrappedCallback_2(in.id.x, in.id.y, in.id.z);
      }

      @group(1) @binding(0) var oldState_1: texture_3d<f32>;

      @group(1) @binding(2) var sampler_3: sampler;

      fn getSummand_2(uv: vec3f, offset: vec3f) -> f32 {
        return textureSampleLevel(oldState_1, sampler_3, (uv + offset), 0).x;
      }

      struct Params_5 {
        deltaTime: f32,
        moveSpeed: f32,
        sensorAngle: f32,
        sensorDistance: f32,
        turnSpeed: f32,
        evaporationRate: f32,
      }

      @group(0) @binding(0) var<uniform> params_4: Params_5;

      @group(1) @binding(1) var newState_6: texture_storage_3d<r32float, write>;

      struct blur_Input_7 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(4, 4, 4) fn blur_0(_arg_0: blur_Input_7) {
        var dims = vec3u(textureDimensions(oldState_1));
        if ((((_arg_0.gid.x >= dims.x) || (_arg_0.gid.y >= dims.y)) || (_arg_0.gid.z >= dims.z))) {
          return;
        }
        var uv = ((vec3f(_arg_0.gid) + 0.5) / vec3f(dims));
        var sum = 0f;
        sum += getSummand_2(uv, (vec3f(-1, 0f, 0f) / vec3f(dims)));
        sum += getSummand_2(uv, (vec3f(1, 0, 0) / vec3f(dims)));
        sum += getSummand_2(uv, (vec3f(0f, -1, 0f) / vec3f(dims)));
        sum += getSummand_2(uv, (vec3f(0, 1, 0) / vec3f(dims)));
        sum += getSummand_2(uv, (vec3f(0f, 0f, -1) / vec3f(dims)));
        sum += getSummand_2(uv, (vec3f(0, 0, 1) / vec3f(dims)));
        var blurred = (sum / 6f);
        var newValue = saturate((blurred - params_4.evaporationRate));
        textureStore(newState_6, _arg_0.gid.xyz, vec4f(newValue, 0f, 0f, 1f));
      }

      var<private> seed_3: vec2f;

      fn seed_2(value: f32) {
        seed_3 = vec2f(value, 0f);
      }

      fn randSeed_1(seed: f32) {
        seed_2(seed);
      }

      @group(1) @binding(1) var oldState_4: texture_storage_3d<r32float, read>;

      struct Agent_6 {
        position: vec3f,
        direction: vec3f,
      }

      @group(1) @binding(0) var<storage, read> oldAgents_5: array<Agent_6>;

      fn getPerpendicular_8(dir: vec3f) -> vec3f {
        var axis = vec3f(1, 0, 0);
        var absX = abs(dir.x);
        var absY = abs(dir.y);
        var absZ = abs(dir.z);
        if (((absY <= absX) && (absY <= absZ))) {
          axis = vec3f(0, 1, 0);
        }
        else {
          if (((absZ <= absX) && (absZ <= absY))) {
            axis = vec3f(0, 0, 1);
          }
        }
        return normalize(cross(dir, axis));
      }

      struct Params_10 {
        deltaTime: f32,
        moveSpeed: f32,
        sensorAngle: f32,
        sensorDistance: f32,
        turnSpeed: f32,
        evaporationRate: f32,
      }

      @group(0) @binding(0) var<uniform> params_9: Params_10;

      struct SenseResult_11 {
        weightedDir: vec3f,
        totalWeight: f32,
      }

      fn sense3D_7(pos: vec3f, direction: vec3f) -> SenseResult_11 {
        var dims = textureDimensions(oldState_4);
        var dimsf = vec3f(dims);
        var weightedDir = vec3f();
        var totalWeight = 0f;
        var perp1 = getPerpendicular_8(direction);
        var perp2 = cross(direction, perp1);
        var numSamples = 8;
        for (var i = 0; (i < numSamples); i++) {
          var theta = (((f32(i) / f32(numSamples)) * 2f) * 3.141592653589793f);
          var coneOffset = ((perp1 * cos(theta)) + (perp2 * sin(theta)));
          var sensorDir = normalize((direction + (coneOffset * sin(params_9.sensorAngle))));
          var sensorPos = (pos + (sensorDir * params_9.sensorDistance));
          var sensorPosInt = vec3u(clamp(sensorPos, vec3f(), (dimsf - vec3f(1))));
          var weight = textureLoad(oldState_4, sensorPosInt).x;
          weightedDir = (weightedDir + (sensorDir * weight));
          totalWeight = (totalWeight + weight);
        }
        return SenseResult_11(weightedDir, totalWeight);
      }

      fn item_14() -> f32 {
        var a = dot(seed_3, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_3, vec2f(54.47856521606445, 345.8415222167969));
        seed_3.x = fract((cos(a) * 136.8168f));
        seed_3.y = fract((cos(b) * 534.7645f));
        return seed_3.y;
      }

      fn randOnUnitSphere_13() -> vec3f {
        var z = ((2f * item_14()) - 1f);
        var oneMinusZSq = sqrt((1f - (z * z)));
        var theta = (6.283185307179586f * item_14());
        var x = (cos(theta) * oneMinusZSq);
        var y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      fn randOnUnitHemisphere_12(normal: vec3f) -> vec3f {
        var value = randOnUnitSphere_13();
        var alignment = dot(normal, value);
        return (sign(alignment) * value);
      }

      fn randUniformExclusive_18() -> f32 {
        return ((item_14() * 0.9999998f) + 1e-7f);
      }

      fn randNormal_17(mu: f32, sigma: f32) -> f32 {
        var theta = (6.283185307179586f * randUniformExclusive_18());
        var R = sqrt((-2 * log(randUniformExclusive_18())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn randInUnitSphere_16() -> vec3f {
        var u = item_14();
        var v = vec3f(randNormal_17(0f, 1f), randNormal_17(0f, 1f), randNormal_17(0f, 1f));
        var vNorm = normalize(v);
        return (vNorm * pow(u, 0.33f));
      }

      fn randInUnitHemisphere_15(normal: vec3f) -> vec3f {
        var value = randInUnitSphere_16();
        var alignment = dot(normal, value);
        return (sign(alignment) * value);
      }

      @group(1) @binding(2) var<storage, read_write> newAgents_19: array<Agent_6>;

      @group(1) @binding(3) var newState_20: texture_storage_3d<r32float, write>;

      struct updateAgents_Input_21 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn updateAgents_0(_arg_0: updateAgents_Input_21) {
        if ((_arg_0.gid.x >= 800000u)) {
          return;
        }
        randSeed_1(((f32(_arg_0.gid.x) / 8e+5f) + 0.1f));
        var dims = textureDimensions(oldState_4);
        var dimsf = vec3f(dims);
        var agent = oldAgents_5[_arg_0.gid.x];
        var direction = normalize(agent.direction);
        var senseResult = sense3D_7(agent.position, direction);
        var targetDirection = select(randOnUnitHemisphere_12(direction), normalize(senseResult.weightedDir), (senseResult.totalWeight > 0.01f));
        direction = normalize((direction + (targetDirection * (params_9.turnSpeed * params_9.deltaTime))));
        var newPos = (agent.position + (direction * (params_9.moveSpeed * params_9.deltaTime)));
        var center = (dimsf / 2);
        if (((newPos.x < 0f) || (newPos.x >= dimsf.x))) {
          newPos.x = clamp(newPos.x, 0f, (dimsf.x - 1f));
          var normal = vec3f(1, 0, 0);
          if ((newPos.x > 1f)) {
            normal = vec3f(-1, 0f, 0f);
          }
          var randomDir = randInUnitHemisphere_15(normal);
          var toCenter = normalize((center - newPos));
          direction = normalize(((randomDir * 0.3) + (toCenter * 0.7)));
        }
        if (((newPos.y < 0f) || (newPos.y >= dimsf.y))) {
          newPos.y = clamp(newPos.y, 0f, (dimsf.y - 1f));
          var normal = vec3f(0, 1, 0);
          if ((newPos.y > 1f)) {
            normal = vec3f(0f, -1, 0f);
          }
          var randomDir = randInUnitHemisphere_15(normal);
          var toCenter = normalize((center - newPos));
          direction = normalize(((randomDir * 0.3) + (toCenter * 0.7)));
        }
        if (((newPos.z < 0f) || (newPos.z >= dimsf.z))) {
          newPos.z = clamp(newPos.z, 0f, (dimsf.z - 1f));
          var normal = vec3f(0, 0, 1);
          if ((newPos.z > 1f)) {
            normal = vec3f(0f, 0f, -1);
          }
          var randomDir = randInUnitHemisphere_15(normal);
          var toCenter = normalize((center - newPos));
          direction = normalize(((randomDir * 0.3) + (toCenter * 0.7)));
        }
        newAgents_19[_arg_0.gid.x] = Agent_6(newPos, direction);
        var oldState = textureLoad(oldState_4, vec3u(newPos)).x;
        var newState = (oldState + 1f);
        textureStore(newState_20, vec3u(newPos), vec4f(newState, 0f, 0f, 1f));
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

      var<private> seed_6: vec2f;

      fn seed2_5(value: vec2f) {
        seed_6 = value;
      }

      fn randSeed2_4(seed: vec2f) {
        seed2_5(seed);
      }

      struct Camera_8 {
        viewProj: mat4x4f,
        invViewProj: mat4x4f,
        position: vec3f,
      }

      @group(0) @binding(0) var<uniform> cameraData_7: Camera_8;

      struct RayBoxResult_10 {
        tNear: f32,
        tFar: f32,
        hit: bool,
      }

      fn rayBoxIntersection_9(rayOrigin: vec3f, rayDir: vec3f, boxMin: vec3f, boxMax: vec3f) -> RayBoxResult_10 {
        var invDir = (vec3f(1) / rayDir);
        var t0 = ((boxMin - rayOrigin) * invDir);
        var t1 = ((boxMax - rayOrigin) * invDir);
        var tmin = min(t0, t1);
        var tmax = max(t0, t1);
        var tNear = max(max(tmin.x, tmin.y), tmin.z);
        var tFar = min(min(tmax.x, tmax.y), tmax.z);
        var hit = ((tFar >= tNear) && (tFar >= 0f));
        return RayBoxResult_10(tNear, tFar, hit);
      }

      fn item_12() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168f));
        seed_6.y = fract((cos(b) * 534.7645f));
        return seed_6.y;
      }

      fn randFloat01_11() -> f32 {
        return item_12();
      }

      @group(1) @binding(0) var state_13: texture_3d<f32>;

      @group(0) @binding(1) var sampler_14: sampler;

      struct fragmentShader_Input_15 {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentShader_3(_arg_0: fragmentShader_Input_15) -> @location(0) vec4f {
        randSeed2_4(_arg_0.uv);
        var ndc = vec2f(((_arg_0.uv.x * 2f) - 1f), (1f - (_arg_0.uv.y * 2f)));
        var ndcNear = vec4f(ndc, -1, 1f);
        var ndcFar = vec4f(ndc, 1f, 1f);
        var worldNear = (cameraData_7.invViewProj * ndcNear);
        var worldFar = (cameraData_7.invViewProj * ndcFar);
        var rayOrigin = (worldNear.xyz / worldNear.w);
        var rayEnd = (worldFar.xyz / worldFar.w);
        var rayDir = normalize((rayEnd - rayOrigin));
        var boxMin = vec3f();
        var boxMax = vec3f(256);
        var isect = rayBoxIntersection_9(rayOrigin, rayDir, boxMin, boxMax);
        if (!isect.hit) {
          return vec4f();
        }
        var jitter = (randFloat01_11() * 20f);
        var tStart = max((isect.tNear + jitter), jitter);
        var tEnd = isect.tFar;
        var intersectionLength = (tEnd - tStart);
        var baseStepsPerUnit = 0.30000001192092896f;
        var minSteps = 8i;
        var maxSteps = 48i;
        var adaptiveSteps = clamp(i32((intersectionLength * baseStepsPerUnit)), minSteps, maxSteps);
        var numSteps = adaptiveSteps;
        var stepSize = (intersectionLength / f32(numSteps));
        var thresholdLo = 0.05999999865889549f;
        var thresholdHi = 0.25f;
        var gamma = 1.399999976158142f;
        var sigmaT = 0.10000000149011612f;
        var albedo = vec3f(0.5699999928474426, 0.4399999976158142, 0.9599999785423279);
        var transmittance = 1f;
        var accum = vec3f();
        var TMin = 0.0010000000474974513f;
        var i = 0i;
        while (((i < numSteps) && (transmittance > TMin))) {
          var t = (tStart + ((f32(i) + 0.5f) * stepSize));
          var pos = (rayOrigin + (rayDir * t));
          var texCoord = (pos / vec3f(256));
          var sampleValue = textureSampleLevel(state_13, sampler_14, texCoord, 0).x;
          var d0 = smoothstep(thresholdLo, thresholdHi, sampleValue);
          var density = pow(d0, gamma);
          var alphaSrc = (1f - exp(((-sigmaT * density) * stepSize)));
          var contrib = (albedo * alphaSrc);
          accum = (accum + (contrib * transmittance));
          transmittance = (transmittance * (1f - alphaSrc));
          i += 1i;
        }
        var alpha = (1f - transmittance);
        return vec4f(accum, alpha);
      }"
    `);
  });
});
