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
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      var<private> seed: vec2f;

      fn seed_1(value: f32) {
        seed = vec2f(value, 0f);
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn sample() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randUniformExclusive() -> f32 {
        return ((sample() * 0.9999998f) + 1e-7f);
      }

      fn randNormal(mu: f32, sigma: f32) -> f32 {
        let theta = (6.283185307179586f * randUniformExclusive());
        let R = sqrt((-2f * log(randUniformExclusive())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn randInUnitSphere() -> vec3f {
        let u = sample();
        var v = vec3f(randNormal(0f, 1f), randNormal(0f, 1f), randNormal(0f, 1f));
        var vNorm = normalize(v);
        return (vNorm * pow(u, 0.33f));
      }

      struct Agent {
        position: vec3f,
        direction: vec3f,
      }

      @group(0) @binding(1) var<storage, read_write> item: array<Agent, 800000>;

      @group(0) @binding(2) var<storage, read_write> item_1: array<Agent, 800000>;

      fn wrappedCallback(x: u32, _arg_1: u32, _arg_2: u32) {
        randSeed((f32(x) / 8e+5f));
        var pos = ((randInUnitSphere() * 64f) + vec3f(128));
        var center = vec3f(128);
        var dir = normalize((center - pos));
        item[x] = Agent(pos, dir);
        item_1[x] = Agent(pos, dir);
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(1) @binding(0) var oldState: texture_3d<f32>;

      @group(1) @binding(2) var sampler_1: sampler;

      fn getSummand(uv: vec3f, offset: vec3f) -> f32 {
        return textureSampleLevel(oldState, sampler_1, (uv + offset), 0).x;
      }

      struct Params {
        deltaTime: f32,
        moveSpeed: f32,
        sensorAngle: f32,
        sensorDistance: f32,
        turnSpeed: f32,
        evaporationRate: f32,
      }

      @group(0) @binding(0) var<uniform> params: Params;

      @group(1) @binding(1) var newState: texture_storage_3d<r32float, write>;

      struct blur_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(4, 4, 4) fn blur(_arg_0: blur_Input) {
        var dims = textureDimensions(oldState);
        if ((((_arg_0.gid.x >= dims.x) || (_arg_0.gid.y >= dims.y)) || (_arg_0.gid.z >= dims.z))) {
          return;
        }
        var uv = ((vec3f(_arg_0.gid) + 0.5f) / vec3f(dims));
        var sum = 0f;
        sum += getSummand(uv, (vec3f(-1, 0, 0) / vec3f(dims)));
        sum += getSummand(uv, (vec3f(1, 0, 0) / vec3f(dims)));
        sum += getSummand(uv, (vec3f(0, -1, 0) / vec3f(dims)));
        sum += getSummand(uv, (vec3f(0, 1, 0) / vec3f(dims)));
        sum += getSummand(uv, (vec3f(0, 0, -1) / vec3f(dims)));
        sum += getSummand(uv, (vec3f(0, 0, 1) / vec3f(dims)));
        let blurred = (sum / 6f);
        let newValue = saturate((blurred - params.evaporationRate));
        textureStore(newState, _arg_0.gid.xyz, vec4f(newValue, 0f, 0f, 1f));
      }

      var<private> seed: vec2f;

      fn seed_1(value: f32) {
        seed = vec2f(value, 0f);
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      @group(1) @binding(1) var oldState: texture_storage_3d<r32float, read>;

      struct Agent {
        position: vec3f,
        direction: vec3f,
      }

      @group(1) @binding(0) var<storage, read> oldAgents: array<Agent>;

      fn getPerpendicular(dir: vec3f) -> vec3f {
        var axis = vec3f(1, 0, 0);
        let absX = abs(dir.x);
        let absY = abs(dir.y);
        let absZ = abs(dir.z);
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

      struct Params {
        deltaTime: f32,
        moveSpeed: f32,
        sensorAngle: f32,
        sensorDistance: f32,
        turnSpeed: f32,
        evaporationRate: f32,
      }

      @group(0) @binding(0) var<uniform> params: Params;

      struct SenseResult {
        weightedDir: vec3f,
        totalWeight: f32,
      }

      fn sense3D(pos: vec3f, direction: vec3f) -> SenseResult {
        var dims = textureDimensions(oldState);
        var dimsf = vec3f(dims);
        var weightedDir = vec3f();
        var totalWeight = 0f;
        var perp1 = getPerpendicular(direction);
        var perp2 = cross(direction, perp1);
        // unrolled iteration #0, 'i' is '0'
        {
          const theta = 0.;
          var coneOffset = ((perp1 * cos(theta)) + (perp2 * sin(theta)));
          var sensorDir = normalize((direction + (coneOffset * sin(params.sensorAngle))));
          var sensorPos = (pos + (sensorDir * params.sensorDistance));
          var sensorPosInt = vec3u(clamp(sensorPos, vec3f(), (dimsf - vec3f(1))));
          let weight = textureLoad(oldState, sensorPosInt).x;
          weightedDir = (weightedDir + (sensorDir * weight));
          totalWeight = (totalWeight + weight);
        }
        // unrolled iteration #1, 'i' is '1'
        {
          const theta = 0.7853981633974483;
          var coneOffset = ((perp1 * cos(theta)) + (perp2 * sin(theta)));
          var sensorDir = normalize((direction + (coneOffset * sin(params.sensorAngle))));
          var sensorPos = (pos + (sensorDir * params.sensorDistance));
          var sensorPosInt = vec3u(clamp(sensorPos, vec3f(), (dimsf - vec3f(1))));
          let weight = textureLoad(oldState, sensorPosInt).x;
          weightedDir = (weightedDir + (sensorDir * weight));
          totalWeight = (totalWeight + weight);
        }
        // unrolled iteration #2, 'i' is '2'
        {
          const theta = 1.5707963267948966;
          var coneOffset = ((perp1 * cos(theta)) + (perp2 * sin(theta)));
          var sensorDir = normalize((direction + (coneOffset * sin(params.sensorAngle))));
          var sensorPos = (pos + (sensorDir * params.sensorDistance));
          var sensorPosInt = vec3u(clamp(sensorPos, vec3f(), (dimsf - vec3f(1))));
          let weight = textureLoad(oldState, sensorPosInt).x;
          weightedDir = (weightedDir + (sensorDir * weight));
          totalWeight = (totalWeight + weight);
        }
        // unrolled iteration #3, 'i' is '3'
        {
          const theta = 2.356194490192345;
          var coneOffset = ((perp1 * cos(theta)) + (perp2 * sin(theta)));
          var sensorDir = normalize((direction + (coneOffset * sin(params.sensorAngle))));
          var sensorPos = (pos + (sensorDir * params.sensorDistance));
          var sensorPosInt = vec3u(clamp(sensorPos, vec3f(), (dimsf - vec3f(1))));
          let weight = textureLoad(oldState, sensorPosInt).x;
          weightedDir = (weightedDir + (sensorDir * weight));
          totalWeight = (totalWeight + weight);
        }
        // unrolled iteration #4, 'i' is '4'
        {
          const theta = 3.141592653589793;
          var coneOffset = ((perp1 * cos(theta)) + (perp2 * sin(theta)));
          var sensorDir = normalize((direction + (coneOffset * sin(params.sensorAngle))));
          var sensorPos = (pos + (sensorDir * params.sensorDistance));
          var sensorPosInt = vec3u(clamp(sensorPos, vec3f(), (dimsf - vec3f(1))));
          let weight = textureLoad(oldState, sensorPosInt).x;
          weightedDir = (weightedDir + (sensorDir * weight));
          totalWeight = (totalWeight + weight);
        }
        // unrolled iteration #5, 'i' is '5'
        {
          const theta = 3.9269908169872414;
          var coneOffset = ((perp1 * cos(theta)) + (perp2 * sin(theta)));
          var sensorDir = normalize((direction + (coneOffset * sin(params.sensorAngle))));
          var sensorPos = (pos + (sensorDir * params.sensorDistance));
          var sensorPosInt = vec3u(clamp(sensorPos, vec3f(), (dimsf - vec3f(1))));
          let weight = textureLoad(oldState, sensorPosInt).x;
          weightedDir = (weightedDir + (sensorDir * weight));
          totalWeight = (totalWeight + weight);
        }
        // unrolled iteration #6, 'i' is '6'
        {
          const theta = 4.71238898038469;
          var coneOffset = ((perp1 * cos(theta)) + (perp2 * sin(theta)));
          var sensorDir = normalize((direction + (coneOffset * sin(params.sensorAngle))));
          var sensorPos = (pos + (sensorDir * params.sensorDistance));
          var sensorPosInt = vec3u(clamp(sensorPos, vec3f(), (dimsf - vec3f(1))));
          let weight = textureLoad(oldState, sensorPosInt).x;
          weightedDir = (weightedDir + (sensorDir * weight));
          totalWeight = (totalWeight + weight);
        }
        // unrolled iteration #7, 'i' is '7'
        {
          const theta = 5.497787143782138;
          var coneOffset = ((perp1 * cos(theta)) + (perp2 * sin(theta)));
          var sensorDir = normalize((direction + (coneOffset * sin(params.sensorAngle))));
          var sensorPos = (pos + (sensorDir * params.sensorDistance));
          var sensorPosInt = vec3u(clamp(sensorPos, vec3f(), (dimsf - vec3f(1))));
          let weight = textureLoad(oldState, sensorPosInt).x;
          weightedDir = (weightedDir + (sensorDir * weight));
          totalWeight = (totalWeight + weight);
        }
        return SenseResult(weightedDir, totalWeight);
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

      fn randOnUnitHemisphere(normal: vec3f) -> vec3f {
        var value = randOnUnitSphere();
        let alignment = dot(normal, value);
        return (sign(alignment) * value);
      }

      fn randUniformExclusive() -> f32 {
        return ((sample() * 0.9999998f) + 1e-7f);
      }

      fn randNormal(mu: f32, sigma: f32) -> f32 {
        let theta = (6.283185307179586f * randUniformExclusive());
        let R = sqrt((-2f * log(randUniformExclusive())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn randInUnitSphere() -> vec3f {
        let u = sample();
        var v = vec3f(randNormal(0f, 1f), randNormal(0f, 1f), randNormal(0f, 1f));
        var vNorm = normalize(v);
        return (vNorm * pow(u, 0.33f));
      }

      fn randInUnitHemisphere(normal: vec3f) -> vec3f {
        var value = randInUnitSphere();
        let alignment = dot(normal, value);
        return (sign(alignment) * value);
      }

      @group(1) @binding(2) var<storage, read_write> newAgents: array<Agent>;

      @group(1) @binding(3) var newState_1: texture_storage_3d<r32float, write>;

      struct updateAgents_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn updateAgents(_arg_0: updateAgents_Input) {
        if ((_arg_0.gid.x >= 800000u)) {
          return;
        }
        randSeed(((f32(_arg_0.gid.x) / 8e+5f) + 0.1f));
        var dims = textureDimensions(oldState);
        var dimsf = vec3f(dims);
        let agent = (&oldAgents[_arg_0.gid.x]);
        var direction = normalize((*agent).direction);
        var senseResult = sense3D((*agent).position, direction);
        var targetDirection = select(randOnUnitHemisphere(direction), normalize(senseResult.weightedDir), (senseResult.totalWeight > 0.01f));
        direction = normalize((direction + (targetDirection * (params.turnSpeed * params.deltaTime))));
        var newPos = ((*agent).position + (direction * (params.moveSpeed * params.deltaTime)));
        var center = (dimsf / 2f);
        if (((newPos.x < 0f) || (newPos.x >= dimsf.x))) {
          newPos.x = clamp(newPos.x, 0f, (dimsf.x - 1f));
          var normal = vec3f(1, 0, 0);
          if ((newPos.x > 1f)) {
            normal = vec3f(-1, 0, 0);
          }
          var randomDir = randInUnitHemisphere(normal);
          var toCenter = normalize((center - newPos));
          direction = normalize(((randomDir * 0.3f) + (toCenter * 0.7f)));
        }
        if (((newPos.y < 0f) || (newPos.y >= dimsf.y))) {
          newPos.y = clamp(newPos.y, 0f, (dimsf.y - 1f));
          var normal = vec3f(0, 1, 0);
          if ((newPos.y > 1f)) {
            normal = vec3f(0, -1, 0);
          }
          var randomDir = randInUnitHemisphere(normal);
          var toCenter = normalize((center - newPos));
          direction = normalize(((randomDir * 0.3f) + (toCenter * 0.7f)));
        }
        if (((newPos.z < 0f) || (newPos.z >= dimsf.z))) {
          newPos.z = clamp(newPos.z, 0f, (dimsf.z - 1f));
          var normal = vec3f(0, 0, 1);
          if ((newPos.z > 1f)) {
            normal = vec3f(0, 0, -1);
          }
          var randomDir = randInUnitHemisphere(normal);
          var toCenter = normalize((center - newPos));
          direction = normalize(((randomDir * 0.3f) + (toCenter * 0.7f)));
        }
        newAgents[_arg_0.gid.x] = Agent(newPos, direction);
        let oldState_1 = textureLoad(oldState, vec3u(newPos)).x;
        let newState = (oldState_1 + 1f);
        textureStore(newState_1, vec3u(newPos), vec4f(newState, 0f, 0f, 1f));
      }

      struct fullScreenTriangle_Input {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(in: fullScreenTriangle_Input) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[in.vertexIndex], 0, 1), uv[in.vertexIndex]);
      }

      var<private> seed: vec2f;

      fn seed2(value: vec2f) {
        seed = value;
      }

      fn randSeed2(seed: vec2f) {
        seed2(seed);
      }

      struct Camera {
        viewProj: mat4x4f,
        invViewProj: mat4x4f,
        position: vec3f,
      }

      @group(0) @binding(0) var<uniform> cameraData: Camera;

      struct RayBoxResult {
        tNear: f32,
        tFar: f32,
        hit: bool,
      }

      fn rayBoxIntersection(rayOrigin: vec3f, rayDir: vec3f, boxMin: vec3f, boxMax: vec3f) -> RayBoxResult {
        var invDir = (vec3f(1) / rayDir);
        var t0 = ((boxMin - rayOrigin) * invDir);
        var t1 = ((boxMax - rayOrigin) * invDir);
        var tmin = min(t0, t1);
        var tmax = max(t0, t1);
        let tNear = max(max(tmin.x, tmin.y), tmin.z);
        let tFar = min(min(tmax.x, tmax.y), tmax.z);
        let hit = ((tFar >= tNear) && (tFar >= 0f));
        return RayBoxResult(tNear, tFar, hit);
      }

      fn sample() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randFloat01() -> f32 {
        return sample();
      }

      @group(1) @binding(0) var state: texture_3d<f32>;

      @group(0) @binding(1) var sampler_1: sampler;

      struct fragmentShader_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentShader(_arg_0: fragmentShader_Input) -> @location(0) vec4f {
        randSeed2(_arg_0.uv);
        var ndc = vec2f(((_arg_0.uv.x * 2f) - 1f), (1f - (_arg_0.uv.y * 2f)));
        var ndcNear = vec4f(ndc, -1f, 1f);
        var ndcFar = vec4f(ndc, 1f, 1f);
        var worldNear = (cameraData.invViewProj * ndcNear);
        var worldFar = (cameraData.invViewProj * ndcFar);
        var rayOrigin = (worldNear.xyz / worldNear.w);
        var rayEnd = (worldFar.xyz / worldFar.w);
        var rayDir = normalize((rayEnd - rayOrigin));
        var boxMin = vec3f();
        var boxMax = vec3f(256);
        var isect = rayBoxIntersection(rayOrigin, rayDir, boxMin, boxMax);
        if (!isect.hit) {
          return vec4f();
        }
        let jitter = (randFloat01() * 20f);
        let tStart = max((isect.tNear + jitter), jitter);
        let tEnd = isect.tFar;
        let intersectionLength = (tEnd - tStart);
        const baseStepsPerUnit = 0.30000001192092896f;
        const minSteps = 8i;
        const maxSteps = 48i;
        let adaptiveSteps = clamp(i32((intersectionLength * baseStepsPerUnit)), minSteps, maxSteps);
        let numSteps = adaptiveSteps;
        let stepSize = (intersectionLength / f32(numSteps));
        const thresholdLo = 0.05999999865889549f;
        const thresholdHi = 0.25f;
        const gamma = 1.399999976158142f;
        const sigmaT = 0.10000000149011612f;
        var albedo = vec3f(0.5699999928474426, 0.4399999976158142, 0.9599999785423279);
        var transmittance = 1f;
        var accum = vec3f();
        const TMin = 0.0010000000474974513f;
        var i = 0i;
        while (((i < numSteps) && (transmittance > TMin))) {
          let t = (tStart + ((f32(i) + 0.5f) * stepSize));
          var pos = (rayOrigin + (rayDir * t));
          var texCoord = (pos / vec3f(256));
          let sampleValue = textureSampleLevel(state, sampler_1, texCoord, 0).x;
          let d0 = smoothstep(thresholdLo, thresholdHi, sampleValue);
          let density = pow(d0, gamma);
          let alphaSrc = (1f - exp(((-(sigmaT) * density) * stepSize)));
          var contrib = (albedo * alphaSrc);
          accum = (accum + (contrib * transmittance));
          transmittance = (transmittance * (1f - alphaSrc));
          i += 1i;
        }
        let alpha = (1f - transmittance);
        return vec4f(accum, alpha);
      }"
    `);
  });
});
